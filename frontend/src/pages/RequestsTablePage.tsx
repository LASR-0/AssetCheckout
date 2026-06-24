import { useEffect, useState } from "react";
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
import StandardApprovalResultDialog from "@/components/dialogs/StandardApprovalResultDialog";

export default function RequestTablePage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [shipDialogOpen, setShipDialogOpen] = useState(false);
  const [tiers, setTiers] = useState<string[]>([]);

  const [filteredCount, setFilteredCount] = useState(0);

  const [selectedTier, setSelectedTier] = useState<string>("STANDARD");

  const COMPANY = import.meta.env.VITE_COMPANY_NAME || "Checkout Central";

  const { role, name: currentUserName } = useAuth();
  const columnVisibility = getColumnVisibility(role);
  const [averages, setAverages] = useState<Record<string, Record<number, number>>>({});
  const [assetDetailsDialogOpen, setAssetDetailsDialogOpen] = useState(false);
  const [standardResultOpen, setStandardResultOpen] = useState(false);
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
      const data = await getRequests({
        status: status === "ALL" ? undefined : status,
        viewAs: role,
        currentUserName,
      });

      setRequests(
        status === "ALL"
          ? data.requests
          : data.requests.filter((req: Request) => req.status === status)
      );
    } catch (err) {
      console.error("Failed to load requests", err);
    }
  }

  // -----------------------------
  // ACTIONS
  // -----------------------------
  async function handleApprove(request: Request) {
    try {
      await apiFetch<{
        type: "STANDARD" | "NON_STANDARD";
        stage?: "MANAGER" | "ADMIN";
        message: string;
      }>(`/api/approval/${request.id}/approve`, {
        method: "POST",
      });

      await loadRequests();
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
        // TODO (step 5): open the anonymous feedback nudge dialog here.
        // Placeholder until the feedback feature lands.
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
            requests={requests}
            role={role}
            currentUserName={currentUserName}
            onApprove={handleApprove}
            onReject={handleRejectClick}
            onCreateModel={handleCreateModel}
            onAssetDetails={handleAssetDetails}
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

      <footer className="w-full py-6 bg-nav px-8 font-semibold text-xs text-nav-tab">
        © {COMPANY}
      </footer>
    </div>
  );
}