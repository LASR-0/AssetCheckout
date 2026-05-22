import { useEffect, useState } from "react";
import RequestsToolbar from "@/components/request-table/RequestsToolbar";
import RequestsPagination from "@/components/request-table/RequestPagination";
import RequestsTable from "@/components/request-table/RequestsTable";
import CreateModelDialog from "@/components/dialogs/CreateModelDialog";
import RejectionReasonDialog from "@/components/dialogs/RejectRequestDialog";
import { getRequests } from "@/api/requests";
import { getPriceAverages, getTiers } from "@/api/analytics";
import type { Request } from "@/types/requestType";
import { getColumnVisibility } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";
import AssetDetailsDialog from "@/components/dialogs/AssetDetailsDialog";
import CompleteResultDialog from "@/components/dialogs/CompleteResultDialog";
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
  const [tiers, setTiers] = useState<string[]>([]);

  const [filteredCount, setFilteredCount] = useState(0);

  const [selectedTier, setSelectedTier] = useState<string>("STANDARD");

  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const { role, name: currentUserName } = useAuth();
  const columnVisibility = getColumnVisibility(role);
  const [averages, setAverages] = useState<Record<string, Record<number, number>>>({});
  const [assetDetailsDialogOpen, setAssetDetailsDialogOpen] = useState(false);
  const [standardResultOpen, setStandardResultOpen] = useState(false);
  const [standardResult, setStandardResult] = useState<
    | { type: "success"; assetTag: string; modelName: string; userName: string }
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
        // Backend will use these to filter; admin sends nothing, manager sends their name, requester sends their name
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
      const res = await fetch(`/api/approval/${request.id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dev-user-name": currentUserName,
        },
      });
  
      const data = await res.json();
  
      if (!res.ok) {
        // For STANDARD failures, show the celebration dialog's error variant.
        // For non-standard failures, fall back to whatever the current handling is
        // (alerts, console, etc.) — out of scope for this phase.
        if (data?.type === "STANDARD" || request.requestType === "STANDARD") {
          setStandardResult({
            type: "error",
            message: data.message || data.error || "Approval failed.",
          });
          setStandardResultOpen(true);
        } else {
          // Existing non-standard error handling — leave as-is for now.
          console.error("Approval failed:", data);
          alert(data.message || data.error || "Approval failed.");
        }
        return;
      }
  
      if (data.type === "STANDARD") {
        // Standard auto-checkout succeeded — show the celebration dialog.
        // Background refresh happens in parallel; by the time admin reads the
        // dialog and clicks Back to requests, the table is already updated.
        loadRequests();
  
        setStandardResult({
          type: "success",
          assetTag: data?.asset?.tag ?? "—",
          modelName: data?.model ?? "Unknown model",
          userName: data?.request?.userName ?? request.userName,
        });
        setStandardResultOpen(true);
      } else {
        // Non-standard approve — just refresh the table, no celebration
        // (there's still work to do downstream).
        await loadRequests();
      }
    } catch (err: any) {
      console.error("Approval error:", err);
      alert("Failed to approve the request. " + (err.message ?? ""));
    }
  }

  async function handleReject(request: Request, reason: string) {
    try {
      await fetch(`/api/approval/${request.id}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dev-user-name": currentUserName,  
        },
        body: JSON.stringify({
          reason: "REJECTED: " + reason + "\n REQUEST: " + request.reason,
        }),
      });
      await loadRequests();
    } catch (err) {
      console.error("Reject failed", err);
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

  function handleComplete(request: Request) {
    setSelectedRequest(request);
    setCompleteDialogOpen(true);
  }

  // -----------------------------
  // PAGINATION CALC (driven by table's filtered count)
  // -----------------------------
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));

  return (
    <div className="min-h-screen bg-surface flex flex-col">
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
            onComplete={handleComplete}
            globalFilter={search}
            page={page}
            pageSize={pageSize}
            onFilteredCountChange={setFilteredCount}
            columnVisibility={columnVisibility}
          />

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

          <CompleteResultDialog
            request={selectedRequest}
            open={completeDialogOpen}
            onOpenChange={setCompleteDialogOpen}
            onSuccess={loadRequests}
            currentUserName={currentUserName}
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
        © KSB Global
      </footer>
    </div>
  );
}