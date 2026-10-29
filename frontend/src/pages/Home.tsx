import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Page } from "@/components/shell/Page";
import { useToast } from "@/components/ui/toast-context";
import { useTourReady } from "@/components/tour/TourProvider";
import EnterSelfProcuredDetailsDialog from "@/components/dialogs/EnterSelfProcuredDetailsDialog";
import HomeHead from "@/components/home/HomeHead";
import NeedsYou from "@/components/home/NeedsYou";
import InFlight from "@/components/home/InFlight";
import Finished from "@/components/home/Finished";
import WhatYouHave from "@/components/home/WhatYouHave";
import AskForSomething from "@/components/home/AskForSomething";
import RequestInspector from "@/components/home/RequestInspector";
import ReportProblem, { type FlowStart } from "@/components/home/ReportProblem";
import { heldAccessories, heldAssets } from "@/components/home/held";
import { useHome, type Row } from "@/components/home/useHome";
import { apiFetch } from "@/api/client";
import { queryClient } from "@/api/queryClient";
import { feedbackEnabledQuery, invalidateWorkflow, requestsQuery } from "@/api/queries";
import { markRequestSeen } from "@/api/requests";
import { notifySeenCleared } from "@/hooks/useActionCounts";
import { needsMyAction } from "@/lib/permissions";
import type { Request } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |                            HOME                                 |
///  +-----------------------------------------------------------------+
//
//  The front door, and for most staff the only page besides a form. It
//  answers three questions, in this order: what needs me, where are my
//  requests up to, and what do I have. Asking for something comes last,
//  because by the time somebody wants to, they know where it is.
//
//  TWO COLUMNS from 1160 design px: the person's requests on the left, what
//  they hold beside them. Below that one column, in reading order.
//
//  Acting from here is limited to the requester's own next step (collect
//  it, confirm it arrived, enter what they bought). Everything else opens in
//  the request log, where the full set of actions lives.
///  +-----------------------------------------------------------------+

const AREA = "min-w-0 pb-4 phone:pb-5";

export default function Home() {
  const home = useHome();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: feedbackOn = false } = useQuery(feedbackEnabledQuery);

  const [inspecting, setInspecting] = useState<number | null>(null);
  const [flow, setFlow] = useState<FlowStart | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [purchasing, setPurchasing] = useState<Request | null>(null);

  const assets = heldAssets(home.holdings.data);
  const accessories = heldAccessories(home.holdings.data);

  // The tour points at the holdings and a status chip, which only exist once
  // these land. Settled either way, so a failure can't block it for good.
  useTourReady(!home.loadingRequests && !home.holdings.isPending);

  // Looked up by id each render, so the panel follows the cache after an action.
  const inspected =
    [...home.open, ...home.finished].find((x) => x.r.id === inspecting) ?? null;

  function open(row: Row) {
    setInspecting(row.r.id);
    // Opening a request is reading it: its "new" marker clears, and the nav
    // badge drops at once if it was counting this one.
    const r = row.r;
    if (r.seenByMe) return;
    const counted = needsMyAction(r, home.viewer.role, home.viewer.userId, home.viewer.name);
    queryClient.setQueryData(requestsQuery.queryKey, (prev) =>
      prev?.map((x) => (x.id === r.id ? { ...x, seenByMe: true } : x))
    );
    void markRequestSeen(r.id);
    if (counted) notifySeenCleared();
  }

  async function act(row: Row) {
    const { r, route } = row;
    if (route.step === "purchase") {
      setPurchasing(r);
      return;
    }
    setBusyId(r.id);
    try {
      const res = await apiFetch<{ promptFeedback?: boolean }>(`/api/approval/${r.id}/receive`, { method: "POST" });
      await invalidateWorkflow();
      const verb = route.step === "lreceive" ? "received" : "collected";
      const ask = !!res?.promptFeedback && feedbackOn;
      toast(`#${r.id} marked ${verb}.${ask ? " How did it go?" : ""}`, {
        action: ask ? { label: "Leave feedback", onClick: () => navigate("/feedback") } : undefined,
      });
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : "Couldn't save that. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  const intro = home.loadingRequests
    ? "Loading your requests…"
    : home.approvals > 0
      ? `${home.approvals === 1 ? "1 request is" : `${home.approvals} requests are`} waiting for your approval.`
      : home.needs.length > 0
        ? `${home.needs.length === 1 ? "One thing needs" : `${home.needs.length} things need`} you today.`
        : home.total > 0
          ? "Nothing needs you right now."
          : "Welcome to Checkout. This is where you ask IT for equipment and follow it until it reaches you.";

  const hasNeedsArea = home.needs.length > 0 || home.approvals > 0;

  return (
    <Page max={1240} className="flex flex-col gap-4 px-3 pt-5 pb-45 phone:gap-5 phone:px-8 phone:pt-7 phone:pb-35">
      <HomeHead name={home.auth.name} loading={home.loadingRequests} counts={home.counts} intro={intro} />

      <div className="grid grid-cols-1 [grid-template-areas:'needs'_'flight'_'have'_'ask'] min-[58rem]:grid-cols-[minmax(0,1fr)_25rem] min-[58rem]:grid-rows-[auto_auto_auto_1fr] min-[58rem]:gap-x-6 min-[58rem]:[grid-template-areas:'needs_have'_'flight_have'_'ask_have'_'._have']">
        {hasNeedsArea && (
          <div className={`${AREA} [grid-area:needs]`}>
            <NeedsYou needs={home.needs} approvals={home.approvals} busyId={busyId} onOpen={open} onAct={act} />
          </div>
        )}

        <div className={`${AREA} flex flex-col gap-4 [grid-area:flight] phone:gap-5`}>
          <InFlight
            rows={home.open}
            anyRequests={home.total > 0}
            loading={home.loadingRequests}
            viewer={home.viewer}
            onOpen={open}
          />
          <Finished rows={home.finished} name={home.auth.name} onOpen={open} />
        </div>

        <div className={`${AREA} [grid-area:have]`}>
          <WhatYouHave
            holdings={home.holdings}
            onReport={(item) => setFlow({ step: "choose", item })}
            onReportMissing={() => setFlow({ step: "missing" })}
          />
        </div>

        <div className={`${AREA} [grid-area:ask]`}>
          <AskForSomething
            assetCategories={home.assetCategories}
            accessoryCategories={home.accessoryCategories}
            assets={assets}
            accessories={accessories}
            onSeeAll={(subject) => setFlow({ step: "list", subject })}
          />
        </div>
      </div>

      <RequestInspector
        row={inspected}
        viewer={home.viewer}
        busy={inspected != null && busyId === inspected.r.id}
        onClose={() => setInspecting(null)}
        onAct={act}
      />

      <ReportProblem start={flow} onClose={() => setFlow(null)} assets={assets} accessories={accessories} />

      <EnterSelfProcuredDetailsDialog
        request={purchasing}
        open={purchasing !== null}
        onOpenChange={(next) => {
          if (!next) setPurchasing(null);
        }}
        onSuccess={() => void invalidateWorkflow()}
      />
    </Page>
  );
}
