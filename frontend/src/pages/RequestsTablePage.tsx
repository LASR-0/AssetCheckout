import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import RequestsToolbar from "@/components/request-table/RequestsToolbar";
import RequestsPagination from "@/components/request-table/RequestPagination";
import RequestsTable from "@/components/request-table/RequestsTable";
import CreateModelDialog from "@/components/dialogs/CreateModelDialog";
import RejectionReasonDialog from "@/components/dialogs/RejectRequestDialog";
import ShipDialog from "@/components/dialogs/ShipDialog";
import { getRequests, markRequestSeen } from "@/api/requests";
import { getPriceAverages, getTiers } from "@/api/analytics";
import type { Request } from "@/types/requestType";
import { deriveStage, isDoneStage } from "@/components/ui/statusbadge";
import {
  getColumnVisibility,
  isApprover,
  isStockKeeper,
  needsMyAction,
} from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/api/client";
import AssetDetailsDialog from "@/components/dialogs/AssetDetailsDialog";
import CreateAccessoryDialog from "@/components/dialogs/CreateAccessoryDialog";
import AccessoryStockDialog from "@/components/dialogs/AccessoryStockDialog";
import StandardApprovalResultDialog from "@/components/dialogs/StandardApprovalResultDialog";
import FeedbackNudgeDialog from "@/components/dialogs/FeedbackNudgeDialog";
import ConfirmApprovalDialog from "@/components/dialogs/ConfirmApprovalDialog";
import SendQuoteDialog from "@/components/dialogs/SendQuoteDialog";
import ReviewQuoteDialog from "@/components/dialogs/ReviewQuoteDialog";
import ManageCorrectionDialog from "@/components/dialogs/ManageCorrectionDialog";
import EditRequestDialog from "@/components/dialogs/EditRequestDialog";
import ConfirmActionDialog from "@/components/dialogs/ConfirmActionDialog";
import EnterSelfProcuredDetailsDialog from "@/components/dialogs/EnterSelfProcuredDetailsDialog";
import ReviewSelfProcuredDialog from "@/components/dialogs/ReviewSelfProcuredDialog";
import { skipQuote } from "@/api/quotes";
import { markUserProcured } from "@/api/selfProcurement";
import { useTourReady } from "@/components/tour/TourProvider";
import {
  notifyActionCountsChanged,
  notifySeenCleared,
} from "@/hooks/useActionCounts";

/**
 * Filter values the status dropdown can hold — one per badge the table shows,
 * plus two synthetic spans. These are STAGE keys from deriveStage, not raw
 * RequestStatus values, so the whole filter is resolved client-side (see
 * visibleRequests below) rather than being handed to the backend's
 * single-status query param.
 *
 * That's deliberate. RequestStatus.COMPLETED is stamped when IT checks the
 * asset out of Snipe, which is several steps short of the requester having it,
 * so a server-side status filter can't distinguish the stages people actually
 * chase. Safe to do here because the requests endpoint isn't paginated — we
 * already hold every row the actor can see, and the table paginates locally.
 *
 * Anything not in this list is ignored when it arrives via the URL, so a stale
 * or hand-edited link falls back to ALL rather than filtering to nothing.
 */
const SELECTABLE_STATUSES = [
  "ALL",
  // Not a stage — the rows blocked on the signed-in person, which is what the
  // nav badge counts. Listed here so the badge has somewhere to send people.
  "NEEDS_ME",
  "IN_PROGRESS",
  "PENDING",
  "AWAITING_IT",
  "APPROVED",
  "AWAITING_QUOTE",
  "AWAITING_SELF_PROCUREMENT",
  "AWAITING_PROCUREMENT_REVIEW",
  "ASSIGNED",
  "READY_TO_COLLECT",
  "SHIPPED",
  "DONE",
  "REJECTED",
  // Accepted for backwards compatibility only: links minted before the stage
  // filter existed carry ?status=COMPLETED, and they meant "finished", which
  // is what DONE now means. Normalised on read below so it never reaches the
  // dropdown as an unmatched value.
  "COMPLETED",
];

export default function RequestTablePage() {
  const [requests, setRequests] = useState<Request[]>([]);
  /** Whether the first fetch has settled — the tour waits for it, so that a
   *  step pointing at a row's actions has rows to find. */
  const [loaded, setLoaded] = useState(false);
  /** Distinguishes the mount fetch from a post-action reload — see loadRequests. */
  const hasLoadedOnce = useRef(false);

  // Seeded from the URL so widgets elsewhere can deep-link into a view:
  // ?status=IN_PROGRESS&q=<name> is what the home page's "In progress" tile
  // links to. Lazy initialisers, so this happens once on mount and never
  // fights the user's own filter changes afterwards.
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(() => {
    const requested = searchParams.get("status");
    if (!requested || !SELECTABLE_STATUSES.includes(requested)) return "ALL";
    // Legacy ?status=COMPLETED means "finished", which is DONE's job now.
    return requested === "COMPLETED" ? "DONE" : requested;
  });
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");

  // "ALL", or a Snipe location id as a string. Seeded from the URL on the same
  // terms as the stage filter, so a stock keeper can bookmark their own site.
  const [location, setLocation] = useState(
    () => searchParams.get("location") ?? "ALL"
  );

  // ?requestId=<n> pins the table to one row — what the home page's recent
  // requests list links to. Kept separate from `search` because the free-text
  // filter deliberately ignores `id` and every `*Id` key (isNoiseKey in
  // RequestsTable), so searching a bare number matches prices and quantities
  // instead of the request you clicked. Anything unparseable is ignored, so a
  // hand-edited link falls back to the full table rather than an empty one.
  const [pinnedId, setPinnedId] = useState<number | null>(() => {
    const raw = searchParams.get("requestId");
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) ? parsed : null;
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [shipDialogOpen, setShipDialogOpen] = useState(false);
  const [tiers, setTiers] = useState<string[]>([]);

  const [filteredCount, setFilteredCount] = useState(0);

  const [selectedTier, setSelectedTier] = useState<string>("STANDARD");

  const {
    role,
    name: currentUserName,
    userId: currentUserId,
    stockKeeperLocations,
  } = useAuth();
  useTourReady(loaded);
  // Keeping stock grants columns on its own: a keeper who has never filed a
  // request is role null, and without this their site's rows render as blank
  // lines. See getColumnVisibility.
  const columnVisibility = getColumnVisibility(
    role,
    isStockKeeper(stockKeeperLocations)
  );
  const [averages, setAverages] = useState<Record<string, Record<number, number>>>({});
  const [assetDetailsDialogOpen, setAssetDetailsDialogOpen] = useState(false);
  const [createAccessoryDialogOpen, setCreateAccessoryDialogOpen] = useState(false);
  const [accessoryStockDialogOpen, setAccessoryStockDialogOpen] = useState(false);
  const [standardResultOpen, setStandardResultOpen] = useState(false);
  const [feedbackNudgeOpen, setFeedbackNudgeOpen] = useState(false);
  const [manageCorrectionOpen, setManageCorrectionOpen] = useState(false);
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [sendQuoteOpen, setSendQuoteOpen] = useState(false);
  const [reviewQuoteOpen, setReviewQuoteOpen] = useState(false);

  // Skip quote / hand-off-to-requester confirmations. Same shape as the
  // manager-stage approval confirmation below — pending/error live beside the
  // open flag so a failure keeps the dialog open with the reason.
  const [skipQuoteOpen, setSkipQuoteOpen] = useState(false);
  const [skipQuotePending, setSkipQuotePending] = useState(false);
  const [skipQuoteError, setSkipQuoteError] = useState<string | null>(null);
  const [markUserProcuredOpen, setMarkUserProcuredOpen] = useState(false);
  const [markUserProcuredPending, setMarkUserProcuredPending] = useState(false);
  const [markUserProcuredError, setMarkUserProcuredError] = useState<string | null>(null);
  const [enterSelfProcuredOpen, setEnterSelfProcuredOpen] = useState(false);
  const [reviewSelfProcuredOpen, setReviewSelfProcuredOpen] = useState(false);

  // Manager-stage approval confirmation — on-behalf, department budget, or
  // both. Separate from the misnamed `approveDialogOpen` above, which drives
  // CreateModelDialog.
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [confirmApprovePending, setConfirmApprovePending] = useState(false);
  const [confirmApproveError, setConfirmApproveError] = useState<string | null>(null);
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
    // No longer keyed on `status` — the fetch is unfiltered and narrowing is
    // a pure client-side derivation, so changing the filter shouldn't refetch.
  }, [page]);

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
      // Always unfiltered. The dropdown now selects a derived STAGE, which the
      // backend's single-status param can't express at all, so narrowing
      // happens in visibleRequests below. Safe because this endpoint is not
      // paginated (findMany with no take), so we already hold every row the
      // actor can see and the table paginates locally.
      const data = await getRequests({});

      setRequests(data.requests);
      // Approving, handing over and confirming a collection all land here via
      // a reload. Each of them changes what is waiting on somebody, so the
      // badges are told to recheck rather than waiting for a navigation.
      //
      // Skipped on the FIRST load: the hook fetches on mount anyway, and
      // signalling here too would cost a second identical query on every
      // visit to this page for no new information.
      if (hasLoadedOnce.current) notifyActionCountsChanged();
      hasLoadedOnce.current = true;
    } catch (err) {
      console.error("Failed to load requests", err);
    } finally {
      // Reported whether the fetch worked or not: the tour's fallbacks cover
      // an empty table, and blocking it behind a failed request would leave
      // the page permanently un-touchable.
      setLoaded(true);
    }
  }

  /**
   * Rows handed to the table, narrowed to the pinned request (if any) and then
   * the selected stage. Narrowing before the table means TanStack's pagination
   * and the filtered-count readout both reflect it for free.
   *
   * The pin narrows FIRST and the stage filter still applies on top, rather
   * than short-circuiting it. That keeps the dropdown behaving the same whether
   * or not a request is pinned — picking a stage the pinned row isn't in shows
   * an empty table with the pin chip still visible above it, which says why.
   *
   * deriveStage is the same function the badge uses, so "filter to Shipped"
   * and "rows showing the Shipped badge" cannot disagree — which is the whole
   * reason the stage is derived in one place rather than stored per row.
   */
  /**
   * The sites present in what this actor can see, for the location filter.
   *
   * Derived from the rows rather than fetched: every request already carries
   * the requester's location, and the only sites worth offering are the ones
   * actually on screen. That also means the control is empty for someone with
   * nothing to filter, which is what hides it.
   *
   * Rows with no recorded location are left out — "unrecorded" is not a site
   * somebody can be a keeper of, and offering it as a filter would suggest it
   * is.
   */
  const locationOptions = useMemo(() => {
    const byId = new Map<number, string>();
    for (const r of requests) {
      const id = r.userLocationId ?? null;
      if (id === null) continue;
      if (!byId.has(id)) byId.set(id, r.userLocationName ?? `Location #${id}`);
    }
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [requests]);

  const visibleRequests = useMemo(() => {
    const pinScoped =
      pinnedId === null ? requests : requests.filter((r) => r.id === pinnedId);

    // Applied before the stage filter, and on the same terms as the pin: the
    // two compose, so narrowing to a site and then to a stage does what it
    // looks like it does.
    const scoped =
      location === "ALL"
        ? pinScoped
        : pinScoped.filter((r) => String(r.userLocationId ?? "") === location);

    if (status === "ALL") return scoped;

    // Answers "which of the 5 are they?" — same predicate the row markers and
    // the nav badge use, so the three cannot disagree.
    if (status === "NEEDS_ME") {
      return scoped.filter((r) =>
        needsMyAction(r, role, currentUserId, currentUserName)
      );
    }

    return scoped.filter((r) => {
      const stage = deriveStage(r);
      if (status === "DONE") return isDoneStage(stage);
      // In flight: anything that hasn't landed and wasn't turned down.
      if (status === "IN_PROGRESS")
        return !isDoneStage(stage) && stage !== "REJECTED";
      return stage === status;
    });
  }, [requests, status, pinnedId, location, role, currentUserId, currentUserName]);

  /** Drop the pin and strip it from the URL, so a refresh doesn't reinstate a
   *  filter the user just dismissed. Other params (status, q) are preserved. */
  function clearPin() {
    setPinnedId(null);
    setPage(1);
    const next = new URLSearchParams(searchParams);
    next.delete("requestId");
    setSearchParams(next, { replace: true });
  }

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

  /**
   * True when approving this request commits a department budget: a
   * non-standard accessory, at the manager stage. Both discriminators are
   * needed — `requestType` separates standard from non-standard, `requestKind`
   * separates asset from accessory — because IT pays for assets and only the
   * accessory side falls to the requester's department.
   *
   * PENDING-only: the acknowledgment belongs to the manager decision. By the
   * admin's IT sign-off the budget has already been accepted, and repeating it
   * there would just be noise.
   *
   * Nothing about the acknowledgment is persisted. A request cannot reach the
   * later quote stage without having passed here, so the state machine is the
   * record — see ConfirmApprovalDialog.
   */
  function isBudgetApproval(request: Request) {
    return (
      request.status === "PENDING" &&
      request.requestKind === "ACCESSORY" &&
      request.requestType === "NON_STANDARD"
    );
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

  /** Confirm handler for the manager-stage approval dialog. Closes only on
   *  success; a failure keeps the dialog open with the reason so the actor can
   *  retry rather than being dropped back to an unchanged-looking row. */
  async function handleConfirmApprove() {
    if (!selectedRequest) return;

    setConfirmApprovePending(true);
    setConfirmApproveError(null);
    try {
      await approveRequest(selectedRequest);
      setConfirmApproveOpen(false);
      setSelectedRequest(null);
    } catch (err) {
      setConfirmApproveError(
        err instanceof Error && err.message
          ? err.message
          : "Approval failed. Please try again."
      );
    } finally {
      setConfirmApprovePending(false);
    }
  }

  async function handleApprove(request: Request) {
    // Either reason to confirm routes through the same dialog, which renders
    // whichever blocks apply — an admin standing in on a non-standard
    // accessory gets both rather than two dialogs in sequence.
    if (isOnBehalfApproval(request) || isBudgetApproval(request)) {
      setSelectedRequest(request);
      setConfirmApproveError(null);
      setConfirmApproveOpen(true);
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
    // Corrections hard-null `reason` at creation, so the original text has to
    // come from the correction detail — otherwise the stored value reads
    // "REQUEST: undefined" and the requester is shown that instead of what
    // they reported. Everything else keeps its own reason.
    const original =
      request.requestKind === "CORRECTION"
        ? request.correctionDetail?.description ?? ""
        : request.reason ?? "";

    try {
      await apiFetch(`/api/approval/${request.id}/reject`, {
        method: "POST",
        body: {
          reason: "REJECTED: " + reason + "\n REQUEST: " + original,
        },
      });
      await loadRequests();
    } catch (err) {
      console.error("Reject failed", err);
      // Rethrown so a caller that shows the failure where the admin is
      // looking (the Manage dialog) can do so, instead of the rejection
      // silently appearing to have worked.
      throw err;
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
    try {
      await handleReject(selectedRequest, reason);
    } catch (err) {
      // handleReject rethrows now, so this has to be caught here or it
      // surfaces as an unhandled rejection. Keeping the dialog open is
      // deliberate: closing it on a failed reject would look like it worked.
      alert(err instanceof Error && err.message ? err.message : "Failed to reject this request.");
      return;
    }
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

  // Quote stage, IT's half: record the supplier's quote and send it.
  function handleSendQuote(request: Request) {
    setSelectedRequest(request);
    setSendQuoteOpen(true);
  }

  // Quote stage, the answer: accept or reject. Opened by the manager from
  // their row (or the link in their email), and by an admin standing in.
  function handleReviewQuote(request: Request) {
    setSelectedRequest(request);
    setReviewQuoteOpen(true);
  }

  // Too cheap to be worth chasing a supplier quote for.
  function handleSkipQuote(request: Request) {
    setSelectedRequest(request);
    setSkipQuoteError(null);
    setSkipQuoteOpen(true);
  }

  async function handleConfirmSkipQuote() {
    if (!selectedRequest) return;
    setSkipQuotePending(true);
    setSkipQuoteError(null);
    try {
      await skipQuote(selectedRequest.id);
      setSkipQuoteOpen(false);
      setSelectedRequest(null);
      await loadRequests();
    } catch (err) {
      setSkipQuoteError(
        err instanceof Error && err.message ? err.message : "Failed to skip the quote. Please try again."
      );
    } finally {
      setSkipQuotePending(false);
    }
  }

  // Hand procurement off to the requester instead of selecting an accessory.
  function handleMarkUserProcured(request: Request) {
    setSelectedRequest(request);
    setMarkUserProcuredError(null);
    setMarkUserProcuredOpen(true);
  }

  async function handleConfirmMarkUserProcured() {
    if (!selectedRequest) return;
    setMarkUserProcuredPending(true);
    setMarkUserProcuredError(null);
    try {
      await markUserProcured(selectedRequest.id);
      setMarkUserProcuredOpen(false);
      setSelectedRequest(null);
      await loadRequests();
    } catch (err) {
      setMarkUserProcuredError(
        err instanceof Error && err.message
          ? err.message
          : "Failed to hand this off to the requester. Please try again."
      );
    } finally {
      setMarkUserProcuredPending(false);
    }
  }

  // The requester reports what they bought.
  function handleSubmitSelfProcuredDetails(request: Request) {
    setSelectedRequest(request);
    setEnterSelfProcuredOpen(true);
  }

  // IT reviews what was bought and completes the request.
  function handleReviewSelfProcured(request: Request) {
    setSelectedRequest(request);
    setReviewSelfProcuredOpen(true);
  }

  // Corrections get one row action — Manage — and both verbs live inside the
  // dialog. They never reach handleApprove's provisioning paths.
  function handleManageCorrection(request: Request) {
    setSelectedRequest(request);
    setManageCorrectionOpen(true);
  }

  // Correcting a request that was filed wrong. Not a stage action: it's
  // offered at every stage the request can still be edited at, so it arrives
  // here from rows that have no other action at all.
  function handleEdit(request: Request) {
    setSelectedRequest(request);
    setEditRequestOpen(true);
  }

  ///  +-----------------------------------------------------------------+
  ///  |             DISMISSING A MARKER, NOT THE WORK                   |
  ///  +-----------------------------------------------------------------+
  //
  //  Flips the row locally first so the dot disappears the instant the dwell
  //  fires, then tells the server. No rollback on failure, deliberately: the
  //  only consequence is that the marker returns on the next load, and
  //  restoring a dot under somebody's cursor a second after it vanished would
  //  read as a glitch rather than as information.
  //
  //  The row itself is untouched — the request is still pending, still
  //  approvable, and still turned up by the "Needs you" filter.
  ///  +-----------------------------------------------------------------+
  function handleSeen(request: Request) {
    // The dwell fires on every unseen row, but only the ones the badge was
    // actually counting should move it. Checked BEFORE the optimistic update
    // below, since that update is what makes it stop qualifying.
    const wasCounted =
      !request.seenByMe &&
      needsMyAction(request, role, currentUserId, currentUserName);

    setRequests((prev) =>
      prev.map((r) => (r.id === request.id ? { ...r, seenByMe: true } : r))
    );
    void markRequestSeen(request.id);

    if (wasCounted) notifySeenCleared();
  }

  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));

  return (
    <div className="min-h-screen bg-landing-bg flex flex-col">
      <main className="mb-20 flex-1 text-on-background">
        {/* HEADER */}
        <div className="text-center mb-15 pt-28">
          <div className="flex items-center justify-center">
            <span className="material-symbols-outlined mx-5 !text-4xl"> pending_actions </span>
            <h1 className="text-4xl text-nav-tab-selected font-bold">Request Log</h1>
          </div>
          <p className="text-info-light mt-2">
            Approvals, quotes and record corrections for devices and accessories.
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
            pinnedId={pinnedId}
            onClearPin={clearPin}
            location={location}
            setLocation={setLocation}
            locationOptions={locationOptions}
          />

          {/* TABLE */}
          <RequestsTable
            requests={visibleRequests}
            role={role}
            currentUserName={currentUserName}
            currentUserId={currentUserId}
            stockKeeperLocations={stockKeeperLocations}
            onSeen={handleSeen}
            onApprove={handleApprove}
            onReject={handleRejectClick}
            onCreateModel={handleCreateModel}
            onAssetDetails={handleAssetDetails}
            onSelectAccessory={handleSelectAccessory}
            onAddAccessoryStock={handleAddAccessoryStock}
            onSendQuote={handleSendQuote}
            onReviewQuote={handleReviewQuote}
            onSkipQuote={handleSkipQuote}
            onMarkShipped={handleMarkShipped}
            onMarkReceived={handleMarkReceived}
            globalFilter={search}
            page={page}
            pageSize={pageSize}
            onFilteredCountChange={setFilteredCount}
            columnVisibility={columnVisibility}
            onMarkReadyForCollection={handleMarkReadyForCollection}
            onManageCorrection={handleManageCorrection}
            onMarkUserProcured={handleMarkUserProcured}
            onSubmitSelfProcuredDetails={handleSubmitSelfProcuredDetails}
            onReviewSelfProcured={handleReviewSelfProcured}
            onEdit={handleEdit}
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

          <ConfirmApprovalDialog
            open={confirmApproveOpen}
            onOpenChange={(next) => {
              setConfirmApproveOpen(next);
              if (!next) {
                setConfirmApproveError(null);
                setSelectedRequest(null);
              }
            }}
            userName={selectedRequest?.userName ?? ""}
            categoryName={selectedRequest?.categoryName ?? ""}
            managerName={selectedRequest?.manager ?? null}
            onBehalf={!!selectedRequest && isOnBehalfApproval(selectedRequest)}
            budget={!!selectedRequest && isBudgetApproval(selectedRequest)}
            pending={confirmApprovePending}
            error={confirmApproveError}
            onConfirm={handleConfirmApprove}
          />

          <SendQuoteDialog
            request={selectedRequest}
            open={sendQuoteOpen}
            onOpenChange={setSendQuoteOpen}
            onSuccess={loadRequests}
          />

          <ReviewQuoteDialog
            request={selectedRequest}
            open={reviewQuoteOpen}
            onOpenChange={setReviewQuoteOpen}
            // Nobody answers a quote on someone else's behalf any more — it
            // spends the manager's budget, so only the named approver is
            // offered it (columns.tsx) and only they are allowed it
            // (resolveQuoteActor). This stays computed rather than hardcoded
            // false so the dialog's copy is derived from who is actually
            // acting, not from an assumption about it.
            onBehalf={
              !!selectedRequest &&
              !isApprover(selectedRequest, currentUserId, currentUserName)
            }
            onSuccess={loadRequests}
          />

          <ConfirmActionDialog
            open={skipQuoteOpen}
            onOpenChange={(next) => {
              setSkipQuoteOpen(next);
              if (!next) {
                setSkipQuoteError(null);
                setSelectedRequest(null);
              }
            }}
            icon="fast_forward"
            title="Skip the quote?"
            description={
              <>
                <strong className="text-modal-text-primary">{selectedRequest?.userName}</strong>'s{" "}
                {selectedRequest?.categoryName} will skip straight to accessory selection — no
                supplier quote, and no further sign-off from{" "}
                {selectedRequest?.manager || "the manager"}.
              </>
            }
            confirmLabel="Skip quote"
            pendingLabel="Skipping..."
            pending={skipQuotePending}
            error={skipQuoteError}
            onConfirm={handleConfirmSkipQuote}
          />

          <ConfirmActionDialog
            open={markUserProcuredOpen}
            onOpenChange={(next) => {
              setMarkUserProcuredOpen(next);
              if (!next) {
                setMarkUserProcuredError(null);
                setSelectedRequest(null);
              }
            }}
            icon="storefront"
            title="Hand off to the requester?"
            description={
              <>
                <strong className="text-modal-text-primary">{selectedRequest?.userName}</strong> will
                be asked to buy their own {selectedRequest?.categoryName} and report back what it
                cost. No accessory will be selected through IT for this request.
              </>
            }
            confirmLabel="Hand off procurement"
            pendingLabel="Sending..."
            pending={markUserProcuredPending}
            error={markUserProcuredError}
            onConfirm={handleConfirmMarkUserProcured}
          />

          <EnterSelfProcuredDetailsDialog
            request={selectedRequest}
            open={enterSelfProcuredOpen}
            onOpenChange={(next) => {
              setEnterSelfProcuredOpen(next);
              if (!next) setSelectedRequest(null);
            }}
            onSuccess={loadRequests}
          />

          <ReviewSelfProcuredDialog
            request={selectedRequest}
            open={reviewSelfProcuredOpen}
            onOpenChange={(next) => {
              setReviewSelfProcuredOpen(next);
              if (!next) setSelectedRequest(null);
            }}
            onSuccess={loadRequests}
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

          <EditRequestDialog
            request={selectedRequest}
            open={editRequestOpen}
            onOpenChange={(next) => {
              setEditRequestOpen(next);
              if (!next) setSelectedRequest(null);
            }}
            // Only fires when something was actually written — the dialog
            // stays quiet on a cancel, or on a save that changed nothing.
            onSuccess={loadRequests}
          />

          <ManageCorrectionDialog
            request={selectedRequest}
            open={manageCorrectionOpen}
            onOpenChange={(next) => {
              setManageCorrectionOpen(next);
              if (!next) setSelectedRequest(null);
            }}
            onSuccess={loadRequests}
            onReject={handleReject}
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