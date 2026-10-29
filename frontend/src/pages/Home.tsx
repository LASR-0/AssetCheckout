import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Page } from "@/components/shell/Page";
import { useToast } from "@/components/ui/toast-context";
import { useTourReady } from "@/components/tour/TourProvider";
import EnterSelfProcuredDetailsDialog from "@/components/dialogs/EnterSelfProcuredDetailsDialog";
import { CountTiles, Greeting } from "@/components/home/HomeHead";
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
import { scrollRoot } from "@/lib/scrollRoot";
import { cn } from "@/lib/utils";

///  +-----------------------------------------------------------------+
///  |                            HOME                                 |
///  +-----------------------------------------------------------------+
//
//  The front door, and for most staff the only page besides a form. It
//  answers three questions, in this order: what needs me, where are my
//  requests up to, and what do I have. Asking for something comes last,
//  because by the time somebody wants to, they know where it is.
//
//  The greeting runs across the top with the counts beside it. Under it, TWO
//  COLUMNS from 1160 design px: the person's requests on the left, what they
//  hold on the right. That column scrolls with the greeting and then holds in
//  view while the left side carries on, as the forms' side panels do (only
//  when it fits on screen, so a long holdings list never puts its own end out
//  of reach). Below 1160, one column in reading order.
//
//  Acting from here is limited to the requester's own next step (collect
//  it, confirm it arrived, enter what they bought). Everything else opens in
//  the request log, where the full set of actions lives.
///  +-----------------------------------------------------------------+

const AREA = "min-w-0 pb-4 phone:pb-5";

/** Whether an element, plus breathing room, fits in the page's scroller. */
function useFitsInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [fits, setFits] = useState(true);
  useEffect(() => {
    const el = ref.current;
    const root = scrollRoot();
    if (!el || !root) return;
    const check = () => setFits(el.getBoundingClientRect().height + 64 <= root.clientHeight);
    const observer = new ResizeObserver(check);
    observer.observe(el);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  return { ref, fits };
}

export default function Home() {
  const home = useHome();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: feedbackOn = false } = useQuery(feedbackEnabledQuery);

  const [inspecting, setInspecting] = useState<number | null>(null);
  const [flow, setFlow] = useState<FlowStart | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [purchasing, setPurchasing] = useState<Request | null>(null);

  const { ref: sideRef, fits: sideFits } = useFitsInView<HTMLDivElement>();
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
    <Page max={1240} className="px-3 pt-5 pb-45 phone:px-8 phone:pt-7 phone:pb-35">
      <div className="grid grid-cols-1 [grid-template-areas:'head'_'needs'_'flight'_'have'_'ask'] min-[58rem]:grid-cols-[minmax(0,1fr)_25rem] min-[58rem]:grid-rows-[auto_auto_auto_1fr] min-[58rem]:gap-x-6 min-[58rem]:[grid-template-areas:'head_head'_'needs_side'_'flight_side'_'ask_side']">
        <div className={`${AREA} flex flex-wrap items-end justify-between gap-x-8 gap-y-4.5 [grid-area:head]`}>
          <Greeting name={home.auth.name} intro={intro} />
          <CountTiles
            name={home.auth.name}
            loading={home.loadingRequests}
            counts={home.counts}
            className="flex-[1_1_100%] phone:flex-[0_1_26.25rem]"
          />
        </div>

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

        <div className={`${AREA} [grid-area:ask]`}>
          <AskForSomething
            assetCategories={home.assetCategories}
            accessoryCategories={home.accessoryCategories}
            assets={assets}
            accessories={accessories}
            onSeeAll={(subject) => setFlow({ step: "list", subject })}
          />
        </div>

        {/* The right-hand column on wide screens. Below that it dissolves
            (display: contents) and "What you have" takes its own row. */}
        <div
          ref={sideRef}
          className={cn(
            "contents min-[58rem]:block min-[58rem]:self-start min-[58rem]:[grid-area:side]",
            sideFits && "min-[58rem]:sticky min-[58rem]:top-7"
          )}
        >
          <div className={`${AREA} [grid-area:have]`}>
            <WhatYouHave
              holdings={home.holdings}
              onReport={(item) => setFlow({ step: "choose", item })}
              onReportMissing={() => setFlow({ step: "missing" })}
            />
          </div>
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
