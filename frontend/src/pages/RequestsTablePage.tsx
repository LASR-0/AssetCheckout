import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import RequestsToolbar from "@/components/request-table/RequestsToolbar";
import RequestsPagination from "@/components/request-table/RequestPagination";
import RequestsTable from "@/components/request-table/RequestsTable";
import CreateModelDialog from "@/components/dialogs/CreateModelDialog";
import RejectionReasonDialog from "@/components/dialogs/RejectRequestDialog";
import ShipDialog from "@/components/dialogs/ShipDialog";
import { getRequests } from "@/api/requests";
import { getPriceAverages, getTiers } from "@/api/analytics";
import type { Request } from "@/types/requestType";
import { getColumnVisibility } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/api/client";
import AssetDetailsDialog from "@/components/dialogs/AssetDetailsDialog";
import CreateAccessoryDialog from "@/components/dialogs/CreateAccessoryDialog";
import AccessoryStockDialog from "@/components/dialogs/AccessoryStockDialog";
import StandardApprovalResultDialog from "@/components/dialogs/StandardApprovalResultDialog";
import FeedbackNudgeDialog from "@/components/dialogs/FeedbackNudgeDialog";
import ConfirmOnBehalfApprovalDialog from "@/components/dialogs/ConfirmOnBehalfApprovalDialog";

/**
 * Filter values the status dropdown can hold. IN_PROGRESS is synthetic — it
 * means PENDING + APPROVED, which the backend's single-status query param
 * can't express, so it is resolved client-side (see serverStatus /
 * visibleRequests below). Anything not in this list is ignored when it
 * arrives via the URL, so a stale or hand-edited link falls back to ALL
 * rather than filtering to nothing.
 */
const SELECTABLE_STATUSES = [
  "ALL",
  "IN_PROGRESS",
  "PENDING",
  "APPROVED",
  "COMPLETED",
  "REJECTED",
];

/** The two statuses the home page's "In progress" tile counts. */
const IN_PROGRESS_STATUSES = ["PENDING", "APPROVED"];

export default function RequestTablePage() {
  const [requests, setRequests] = useState<Request[]>([]);

  // Seeded from the URL so widgets elsewhere can deep-link into a view:
  // ?status=IN_PROGRESS&q=<name> is what the home page's "In progress" tile
  // links to. Lazy initialisers, so this happens once on mount and never
  // fights the user's own filter changes afterwards.
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(() => {
    const requested = searchParams.get("status");
    return requested && SELECTABLE_STATUSES.includes(requested)
      ? requested
      : "ALL";
  });
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [shipDialogOpen, setShipDialogOpen] = useState(false);
  const [tiers, setTiers] = useState<string[]>([]);

  const [filteredCount, setFilteredCount] = useState(0);

  const [selectedTier, setSelectedTier] = useState<string>("STANDARD");

  const { role, name: currentUserName } = useAuth();
  const columnVisibility = getColumnVisibility(role);
  const [averages, setAverages] = useState<Record<string, Record<number, number>>>({});
  const [assetDetailsDialogOpen, setAssetDetailsDialogOpen] = useState(false);
  const [createAccessoryDialogOpen, setCreateAccessoryDialogOpen] = useState(false);
  const [accessoryStockDialogOpen, setAccessoryStockDialogOpen] = useState(false);
  const [standardResultOpen, setStandardResultOpen] = useState(false);
  const [feedbackNudgeOpen, setFeedbackNudgeOpen] = useState(false);

  // Admin-approving-for-a-manager confirmation. Separate from the misnamed
  // `approveDialogOpen` above, which drives CreateModelDialog.
  const [onBehalfOpen, setOnBehalfOpen] = useState(false);
  const [onBehalfPending, setOnBehalfPending] = useState(false);
  const [onBehalfError, setOnBehalfError] = useState<string | null>(null);
  const [standardResult, setStandardResult] = useState<
    | { type: "success"; stage: "SHIPPED" | "READY_FOR_COLLECTION"; userName: string; categoryName: string }
    | { type: "error"; message: string }
    | null
  >(null);

  // -----------------------------
  // DATA FETCH
  // -----------------------------
  useEffect(() => {
    loadRequests();
    loadTiers();
  }, [status, page]);

  useEffect(() => {
  let cancelled = false;
  async function load() {
    try {
      const tiers = await getTiers();

      const tierAveragesArray = await Promise.all(
        tiers.map(async (tier) => ({
          tier: tier.toLowerCase(),
          averages: await getPriceAverages(tier),
        }))
      );

      const allTierAverages: Record<string, Record<number, number>> = {};
      for (const entry of tierAveragesArray) {
        allTierAverages[entry.tier] = entry.averages;
      }

      if (!cancelled) setAverages(allTierAverages);
      } catch (err) {
        console.error("Failed to load tier averages", err);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function loadTiers() {
    try {
      const data = await getTiers();
      setTiers(data);
    } catch (err) {
      console.error("Failed to load tiers", err);
    }
  }

  async function loadRequests() {
    try {
      // IN_PROGRESS spans two statuses, so it can't go to the server — fetch
      // unfiltered and narrow client-side. Safe because this endpoint is not
      // paginated (findMany with no take), so we already hold every row the
      // actor can see and the table paginates locally.
      const serverStatus =
        status === "ALL" || status === "IN_PROGRESS" ? undefined : status;

      const data = await getRequests({ status: serverStatus });

      setRequests(data.requests);
    } catch (err) {
      console.error("Failed to load requests", err);
    }
  }

  /**
   * Rows handed to the table. Only IN_PROGRESS narrows here — every other
   * value was already applied by the server, so this is a pass-through and
   * doesn't double-filter. Narrowing before the table means TanStack's
   * pagination and the filtered-count readout both reflect it for free.
   */
  const visibleRequests = useMemo(
    () =>
      status === "IN_PROGRESS"
        ? requests.filter((r) => IN_PROGRESS_STATUSES.includes(r.status))
        : requests,
    [requests, status]
  );

  // -----------------------------
  // ACTIONS
  // -----------------------------
  /**
   * True when this admin would be standing in for a manager who hasn't
   * answered yet. That is the one approval on this table that isn't the
   * actor's own decision, so it gets a confirmation step. An admin's own IT
   * sign-off at the second stage is routine and deliberately NOT gated.
   */
  function isOnBehalfApproval(request: Request) {
    return role === "ADMIN" && request.status === "PENDING";
  }

  /** The approve POST plus refresh. Throws, so each caller can surface the
   *  failure where the user is looking — inline in the on-behalf dialog, or
   *  the pre-existing result-dialog/alert path. */
  async function approveRequest(request: Request) {
    await apiFetch<{
      type: "STANDARD" | "NON_STANDARD";
      stage?: "MANAGER" | "ADMIN";
      message: string;
    }>(`/api/approval/${request.id}/approve`, {
      method: "POST",
    });

    await loadRequests();
  }

  /** Confirm handler for the on-behalf dialog. Closes only on success; a
   *  failure keeps the dialog open with the reason so the admin can retry
   *  rather than being dropped back to an unchanged-looking row. */
  async function handleConfirmOnBehalfApprove() {
    if (!selectedRequest) return;

    setOnBehalfPending(true);
    setOnBehalfError(null);
    try {
      await approveRequest(selectedRequest);
      setOnBehalfOpen(false);
      setSelectedRequest(null);
    } catch (err) {
      setOnBehalfError(
        err instanceof Error && err.message
          ? err.message
          : "Approval failed. Please try again."
      );
    } finally {
      setOnBehalfPending(false);
    }
  }

  async function handleApprove(request: Request) {
    if (isOnBehalfApproval(request)) {
      setSelectedRequest(request);
      setOnBehalfError(null);
      setOnBehalfOpen(true);
      return;
    }

    try {
      await approveRequest(request);
    } catch (err: any) {
      if (request.requestType === "STANDARD") {
        setStandardResult({ type: "error", message: err.message || "Approval failed." });
        setStandardResultOpen(true);
      } else {
        console.error("Approval failed:", err);
        alert(err.message || "Approval failed.");
      }
    }
  }

  async function handleReject(request: Request, reason: string) {
    try {
      await apiFetch(`/api/approval/${request.id}/reject`, {
        method: "POST",
        body: {
          reason: "REJECTED: " + reason + "\n REQUEST: " + request.reason,
        },
      });
      await loadRequests();
    } catch (err) {
      console.error("Reject failed", err);
    }
  }

  function handleMarkShipped(request: Request) {
    setSelectedRequest(request);
    setShipDialogOpen(true);
  }

  async function handleConfirmShip(trackingCode: string, trackingUrl: string) {
    if (!selectedRequest) return;
    try {
      await apiFetch(`/api/approval/${selectedRequest.id}/ship`, {
        method: "POST",
        body: {
          ...(trackingCode ? { trackingCode } : {}),
          ...(trackingUrl ? { trackingUrl } : {}),
        },
      });
      setShipDialogOpen(false);
      await loadRequests();
      setStandardResult({
        type: "success",
        stage: "SHIPPED",
        userName: selectedRequest.userName,
        categoryName: selectedRequest.categoryName,
      });
      setStandardResultOpen(true);
    } catch (err: any) {
      console.error("Mark shipped failed:", err);
      alert(err.message || "Failed to mark request as shipped.");
    }
  }

  async function handleMarkReceived(request: Request) {
    try {
      const data = await apiFetch<{
        promptFeedback: boolean;
        message: string;
      }>(`/api/approval/${request.id}/receive`, {
        method: "POST",
      });

      await loadRequests();

      if (data.promptFeedback) {
        setFeedbackNudgeOpen(true);
      }
    } catch (err: any) {
      console.error("Mark received failed:", err);
      alert(err.message || "Failed to mark request as received.");
    }
  }

  async function handleMarkReadyForCollection(request: Request) {
    try {
      await apiFetch(`/api/approval/${request.id}/ready-for-collection`, {
        method: "POST",
      });
      await loadRequests();
      setStandardResult({
        type: "success",
        stage: "READY_FOR_COLLECTION",
        userName: request.userName,
        categoryName: request.categoryName,
      });
      setStandardResultOpen(true);
    } catch (err: any) {
      console.error("Mark ready for collection failed:", err);
      alert(err.message || "Failed to mark request as ready for collection.");
    }
  }

  const handleRejectClick = (request: Request) => {
    setSelectedRequest(request);
    setRejectDialogOpen(true);
  };

  const handleConfirmReject = async (reason: string) => {
    if (!selectedRequest) return;
    await handleReject(selectedRequest, reason);
    setRejectDialogOpen(false);
    setSelectedRequest(null);
  };

  function handleCreateModel(request: Request) {
    setSelectedRequest(request);
    setApproveDialogOpen(true);
  }

  function handleAssetDetails(request: Request) {
    setSelectedRequest(request);
    setAssetDetailsDialogOpen(true);
  }

  // Accessory non-standard: selection dialog (search → pick/create), and the
  // separate quantity-waiting dialog surfaced by the row's "Add stock" action.
  function handleSelectAccessory(request: Request) {
    setSelectedRequest(request);
    setCreateAccessoryDialogOpen(true);
  }

  function handleAddAccessoryStock(request: Request) {
    setSelectedRequest(request);
    setAccessoryStockDialogOpen(true);
  }

  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));

  return (
    <div className="min-h-screen bg-landing-bg flex flex-col">
      <main className="mb-20 flex-1 text-on-background">
        {/* HEADER */}
        <div className="text-center mb-15 pt-28">
          <div className="flex items-center justify-center">
            <span className="material-symbols-outlined mx-5 !text-4xl"> pending_actions </span>
            <h1 className="text-4xl font-bold">Request Log</h1>
          </div>
          <p className="text-info-light mt-2">
            Manage non-standard asset approvals and special requests.
          </p>
        </div>

        <div className="max-w-7xl min-w-[100px] shadow-md rounded-xl mx-auto">
          {/* TOOLBAR */}
          <RequestsToolbar
            status={status}
            setStatus={setStatus}
            search={search}
            setSearch={setSearch}
            pageSize={pageSize}
            setPageSize={setPageSize}
            setPage={setPage}
            setSelectedTier={setSelectedTier}
            selectedTier={selectedTier}
            tiers={tiers}
            role={role}
          />

          {/* TABLE */}
          <RequestsTable
            requests={visibleRequests}
            role={role}
            currentUserName={currentUserName}
            onApprove={handleApprove}
            onReject={handleRejectClick}
            onCreateModel={handleCreateModel}
            onAssetDetails={handleAssetDetails}
            onSelectAccessory={handleSelectAccessory}
            onAddAccessoryStock={handleAddAccessoryStock}
            onMarkShipped={handleMarkShipped}
            onMarkReceived={handleMarkReceived}
            globalFilter={search}
            page={page}
            pageSize={pageSize}
            onFilteredCountChange={setFilteredCount}
            columnVisibility={columnVisibility}
            onMarkReadyForCollection={handleMarkReadyForCollection}
          />
          {/* DIALOGS */}
          <RejectionReasonDialog
            open={rejectDialogOpen}
            onOpenChange={setRejectDialogOpen}
            onConfirm={handleConfirmReject}
            // Only defined when the admin is rejecting ahead of the manager —
            // the same condition that gates the approval confirmation. Reject
            // gets an inline notice rather than its own gate, since typing a
            // reason is already a deliberate act.
            onBehalfOfManager={
              selectedRequest && isOnBehalfApproval(selectedRequest)
                ? selectedRequest.manager ?? ""
                : undefined
            }
          />

          <ConfirmOnBehalfApprovalDialog
            open={onBehalfOpen}
            onOpenChange={(next) => {
              setOnBehalfOpen(next);
              if (!next) {
                setOnBehalfError(null);
                setSelectedRequest(null);
              }
            }}
            userName={selectedRequest?.userName ?? ""}
            categoryName={selectedRequest?.categoryName ?? ""}
            managerName={selectedRequest?.manager ?? null}
            pending={onBehalfPending}
            error={onBehalfError}
            onConfirm={handleConfirmOnBehalfApprove}
          />

          <CreateModelDialog
            request={selectedRequest}
            open={approveDialogOpen}
            onOpenChange={setApproveDialogOpen}
            currentUserName={currentUserName}
            onSuccess={loadRequests}
          />

          <AssetDetailsDialog
            request={selectedRequest}
            open={assetDetailsDialogOpen}
            onOpenChange={setAssetDetailsDialogOpen}
            onSuccess={loadRequests}
            currentUserName={currentUserName}
            averages={averages}
          />

          <CreateAccessoryDialog
            request={selectedRequest}
            open={createAccessoryDialogOpen}
            onOpenChange={setCreateAccessoryDialogOpen}
            onSuccess={loadRequests}
            currentUserName={currentUserName}
          />

          <AccessoryStockDialog
            request={selectedRequest}
            open={accessoryStockDialogOpen}
            onOpenChange={setAccessoryStockDialogOpen}
            onSuccess={loadRequests}
          />

          <ShipDialog
            request={selectedRequest}
            open={shipDialogOpen}
            onOpenChange={setShipDialogOpen}
            onConfirm={handleConfirmShip}
          />

          <StandardApprovalResultDialog
            open={standardResultOpen}
            onOpenChange={(open) => {
              setStandardResultOpen(open);
              if (!open) setStandardResult(null);
            }}
            result={standardResult}
          />

          <FeedbackNudgeDialog
            open={feedbackNudgeOpen}
            onOpenChange={setFeedbackNudgeOpen}
          />

          {/* PAGINATION */}
          <RequestsPagination
            page={page}
            setPage={setPage}
            count={totalPages}
            total={pageSize}
            totalItems={filteredCount}
          />
        </div>
      </main>
    </div>
  );
}