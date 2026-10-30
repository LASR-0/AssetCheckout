import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/variants";
import { Tray, Sheet } from "@/components/ui/tray";
import { HolderChip, IdentityPill, StateChip } from "@/components/ui/pills";
import { Inspector, InspectorHeader } from "@/components/ui/inspector";
import { RouteChain } from "@/components/ui/route-rail";
import { siteColoursQuery } from "@/api/queries";
import { actionFor, canAct, holderOf, stageMeta, stationHolder, type StepKey, type Viewer } from "@/lib/route";
import { moveText, REQUESTEE_ACTIONS } from "@/lib/routeCopy";
import { kindAccent, kindLabel, requestTitle } from "@/lib/requestDisplay";
import { shortDate } from "@/lib/format";
import { kindOf } from "@/lib/route";
import type { Row } from "./useHome";
import { ACTION } from "./styles";

type Props = {
  row: Row | null;
  viewer: Viewer;
  busy: boolean;
  onClose: () => void;
  onAct: (row: Row) => void;
};

type Fact = { k: string; v: string; mono?: boolean };

function facts(row: Row): Fact[] {
  const { r, route } = row;
  const kind = kindOf(r);
  const out: (Fact | false)[] = [
    { k: "Kind", v: kindLabel(r) },
    { k: "For", v: "Yourself" },
    { k: "Site", v: r.userLocationName?.trim() || "Not recorded" },
    {
      k: "Approver",
      v: kind === "LOAN" || kind === "CORRECTION" ? "No approval needed" : r.manager ?? "—",
    },
    { k: "Filed", v: shortDate(r.createdAt) },
    !!r.trackingCode && { k: "Tracking", v: r.trackingCode, mono: true },
    kind === "CORRECTION" && !!r.correctionDetail?.description && { k: "You said", v: r.correctionDetail.description },
    !!route.rejected?.reason && { k: "Reason", v: route.rejected.reason },
    !!route.rejected?.by && { k: "Rejected by", v: route.rejected.by },
  ];
  return out.filter((f): f is Fact => !!f);
}

/**
 * One request, opened from Home: who has it now, its route, and the facts.
 * Read-only apart from the requester's own next step, which is the same
 * action as the "Needs you" card. Everything else lives in the request log.
 */
export default function RequestInspector({ row: current, viewer, busy, onClose, onAct }: Props) {
  const { data: siteColours } = useQuery(siteColoursQuery);
  // The last request shown, so the panel still has it while it slides out.
  const [last, setLast] = useState(current);
  if (current && current !== last) setLast(current);
  const row = current ?? last;
  if (!row) return null;

  const { r, route } = row;
  const meta = stageMeta(route.stage);
  const holder = holderOf(r, route, viewer);
  const open = !route.finished && !route.rejected;
  const mine =
    open && !!route.step && REQUESTEE_ACTIONS.has(route.step) && canAct(r, route, viewer);
  const action = mine ? actionFor(r, route) : null;
  const site = r.userLocationName?.trim();

  return (
    <Inspector open={!!current} onClose={onClose} label={`Request #${r.id}`} backLabel="Home">
      <InspectorHeader
        code={`#${r.id}`}
        title={requestTitle(r)}
        pills={
          <>
            <IdentityPill accent={kindAccent(r)}>{kindLabel(r)}</IdentityPill>
            {site && (
              <IdentityPill colour={r.userLocationId != null ? siteColours?.[String(r.userLocationId)] ?? null : null}>
                {site}
              </IdentityPill>
            )}
          </>
        }
        chip={
          <StateChip intent={meta.intent} icon={meta.icon}>
            {meta.label}
          </StateChip>
        }
        onClose={onClose}
      />

      <Tray label={open ? "Whose move" : "Outcome"}>
        <Sheet className="flex flex-col gap-3 p-3.5">
          {open && holder && (
            <HolderChip icon={holder.icon} mine={holder.label === "With you"} className="self-start">
              {holder.label}
            </HolderChip>
          )}
          <p className="m-0 fs-12.5 leading-[1.55] text-pretty text-tx2">{moveText(r, route, viewer)}</p>
          {action && (
            <Button variant="primary" className={cn(ACTION, "self-start px-4.5")} disabled={busy} onClick={() => onAct(row)}>
              {busy ? "Saving…" : action}
            </Button>
          )}
        </Sheet>
      </Tray>

      <Tray label="Route">
        <Sheet className="px-3.5 pt-1 pb-2">
          <RouteChain
            route={route}
            holder={holder?.label}
            futureSub={(s) => (s.key === "filed" ? null : stationHolder(r, s.key as StepKey, viewer))}
          />
        </Sheet>
      </Tray>

      <Tray label="Request">
        <Sheet className="px-3.5">
          {facts(row).map((f, i) => (
            <div
              key={f.k}
              className={cn("flex justify-between gap-4 py-2.75 fs-12", i > 0 && "border-t border-line2")}
            >
              <span className="flex-none text-mut">{f.k}</span>
              <span className={cn("min-w-0 text-right text-pretty", f.mono ? "font-mono fs-13" : "fs-14")}>{f.v}</span>
            </div>
          ))}
        </Sheet>
      </Tray>

      <Link
        to={`/requests?requestId=${r.id}`}
        className={cn(buttonVariants({ variant: "secondary" }), ACTION, "w-full justify-center gap-1.5")}
      >
        Open in the request log
        <Icon name="arrow_outward" size={15} />
      </Link>
    </Inspector>
  );
}
