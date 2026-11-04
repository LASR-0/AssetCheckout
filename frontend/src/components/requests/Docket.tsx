import { useState, type ComponentType, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Flag, HolderChip, IdentityPill, StateChip } from "@/components/ui/pills";
import { RouteChain } from "@/components/ui/route-rail";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast-context";
import { feedbackEnabledQuery, invalidateWorkflow, siteColoursQuery } from "@/api/queries";
import { approveRequest, markReadyToCollect, markReceived } from "@/api/requests";
import { returnLoan } from "@/api/loans";
import { canEditRequest, isApprover } from "@/lib/permissions";
import { kindOf, stageMeta, stationHolder, type StepKey, type Viewer } from "@/lib/route";
import { kindAccent, kindLabel } from "@/lib/requestDisplay";
import { shortDate } from "@/lib/format";
import { formatStartShort, isStartPending } from "@/lib/startDate";
import type { LogRow } from "./useRequestLog";
import { confirmCopy, daysSince, doneText, PENDING, since, STEP_FORM, waitingText, yourMove, type FormKind } from "./copy";
import { factsOf } from "./facts";
import { PendingButton } from "./steps/parts";
import { errorText, type StepProps } from "./steps/types";
import { ShipStep } from "./steps/ShipStep";
import { RejectStep } from "./steps/RejectStep";
import { ModelStep } from "./steps/ModelStep";
import { DetailsStep } from "./steps/DetailsStep";
import { QuoteStep } from "./steps/QuoteStep";
import { ReviewStep } from "./steps/ReviewStep";
import { SelectStep } from "./steps/SelectStep";
import { StockStep } from "./steps/StockStep";
import { PurchaseStep } from "./steps/PurchaseStep";
import { ProcRevStep } from "./steps/ProcRevStep";
import { AssignStep } from "./steps/AssignStep";
import { ManageStep } from "./steps/ManageStep";
import { EditStep } from "./steps/EditStep";
import { StartStep } from "./steps/StartStep";

///  +-----------------------------------------------------------------+
///  |                  THE DOCKET                                     |
///  +-----------------------------------------------------------------+
//
//  One request, opened from the log: what it is, whose move it is, the
//  chain of custody, and the facts. The "Your move" tray is where work
//  happens. A yes/no step asks there; a step with a choice to make opens
//  there as a small form. That replaces the ~20 dialogs this page used to
//  stack; only money and irreversible confirmations still ask twice.
//
//  The tray's colour says whose it is: purple yours, neutral someone
//  else's, green done, red rejected or failed.
///  +-----------------------------------------------------------------+

export type Intent = "look" | "act";

type Mode =
  | { k: "idle" }
  | { k: "confirm" }
  | { k: "pending"; text: string }
  | { k: "form"; form: FormKind }
  | { k: "done" }
  | { k: "failed"; text: string };

const STEPS: Record<FormKind, ComponentType<StepProps>> = {
  ship: ShipStep,
  model: ModelStep,
  details: DetailsStep,
  quote: QuoteStep,
  review: ReviewStep,
  select: SelectStep,
  stock: StockStep,
  purchase: PurchaseStep,
  procrev: ProcRevStep,
  assign: AssignStep,
  manage: ManageStep,
  reject: RejectStep,
  edit: EditStep,
  start: StartStep,
};

const FORM_LABEL: Partial<Record<FormKind, string>> = {
  reject: "Reject",
  edit: "Edit request",
  start: "Start date",
};

type Tone = "mine" | "neutral" | "ok" | "stop";

const TONE: Record<Tone, { wrap: string; label: string; inner: string }> = {
  mine: { wrap: "bg-brand-sub", label: "text-brand-tx", inner: "border-brand-line" },
  neutral: { wrap: "bg-tray", label: "text-mut", inner: "border-line" },
  ok: { wrap: "bg-ok-bg", label: "text-ok", inner: "border-ok-line" },
  stop: { wrap: "bg-stop-bg", label: "text-stop", inner: "border-stop-line" },
};

function TrayFrame({ tone, label, meta, children }: { tone: Tone; label: string; meta?: string; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <section aria-label={label} className={cn("mx-3.5 rounded-14 p-0.75 transition-colors", t.wrap)}>
      <div className={cn("flex justify-between px-2.5 pt-1.75 pb-1.5 font-title fs-11 font-medium tracking-label uppercase", t.label)}>
        <span>{label}</span>
        {meta && <span className="font-sans fs-12 font-normal tracking-normal normal-case">{meta}</span>}
      </div>
      <div className={cn("flex flex-col gap-3 rounded-11 border bg-sheet px-4 py-3.5", t.inner)}>{children}</div>
    </section>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex gap-2.5 rounded-9 bg-stop-bg px-3 py-2.5 fs-13 leading-normal text-stop shadow-[inset_0_0_0_1px_var(--stop-line)]">
      <Icon name="sync_problem" size={18} className="shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/** The tray's head: what's going on, and the buttons that answer it. */
function TrayHead({ holder, text, note, buttons }: { holder?: ReactNode; text: string; note?: string | null; buttons?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="flex min-w-0 flex-[1_1_15rem] flex-col gap-2">
        {holder}
        <p className="m-0 fs-14 leading-normal text-pretty text-tx2">{text}</p>
        {note && <p className="m-0 fs-12.5 leading-normal text-pretty text-mut">{note}</p>}
      </div>
      {buttons && <div className="flex flex-none gap-2">{buttons}</div>}
    </div>
  );
}

const BTN = "h-9 px-3.5";

type Props = {
  row: LogRow;
  viewer: Viewer;
  /** Opened by the row's action button: go straight to the step. */
  intent: Intent;
  /** An action landed: the list tints the row. */
  onLanded: (id: number) => void;
};

export function Docket({ row, viewer, intent, onLanded }: Props) {
  const { r, route } = row;
  const toast = useToast();
  const navigate = useNavigate();
  const { data: siteColours } = useQuery(siteColoursQuery);
  const { data: feedbackOn = false } = useQuery(feedbackEnabledQuery);

  const startMode = (): Mode => {
    if (intent !== "act" || !row.mine || !route.step) return { k: "idle" };
    const form = STEP_FORM[route.step];
    return form ? { k: "form", form } : { k: "confirm" };
  };
  const [mode, setMode] = useState<Mode>(startMode);
  const [error, setError] = useState<string | null>(null);

  const step = route.step;
  const admin = viewer.role === "ADMIN";

  async function landed(message: string, action?: { label: string; onClick: () => void }) {
    await invalidateWorkflow();
    setError(null);
    setMode({ k: "done" });
    onLanded(r.id);
    toast(message, action ? { action } : undefined);
  }

  function act() {
    if (!step) return;
    setError(null);
    const form = STEP_FORM[step];
    setMode(form ? { k: "form", form } : { k: "confirm" });
  }

  async function confirm() {
    if (!step) return;
    setMode({ k: "pending", text: PENDING[step] ?? "Working…" });
    setError(null);
    try {
      await runConfirm(step);
    } catch (err) {
      const msg = errorText(err, "That didn't go through. Please try again.");
      // A standard sign-off assigns stock in the same call; when there is none,
      // nothing changed and the tray says so rather than a generic failure.
      if (step === "it" && r.requestType !== "NON_STANDARD") setMode({ k: "failed", text: msg });
      else {
        setError(msg);
        setMode({ k: "confirm" });
      }
    }
  }

  async function runConfirm(s: StepKey) {
    switch (s) {
      case "mgr":
      case "it":
        await approveRequest(r.id);
        return landed(s === "mgr" ? `#${r.id} approved.` : `#${r.id} signed off.`);
      case "arrive":
      case "prep":
        await markReadyToCollect(r.id);
        return landed(`#${r.id} is ready to collect. ${r.userName} has been emailed.`);
      case "collect":
      case "receive":
      case "lcollect":
      case "lreceive": {
        const res = await markReceived(r.id);
        const ask = !!res?.promptFeedback && feedbackOn;
        const verb = s === "lreceive" ? "received" : "collected";
        return landed(
          `#${r.id} marked ${verb}.${ask ? " How did it go?" : ""}`,
          ask ? { label: "Leave feedback", onClick: () => navigate("/feedback") } : undefined
        );
      }
      case "lreturn": {
        const res = await returnLoan(r.id);
        // A refused check-in is a result, not an exception: the device is back
        // but Snipe-IT still shows it out, so the loan stays open.
        if (!res.checkedIn) {
          await invalidateWorkflow();
          setError(`${res.message} The loan is still open. Retry the return.`);
          setMode({ k: "idle" });
          return;
        }
        return landed(`#${r.id} returned and checked in.`);
      }
    }
  }

  // ---- the "Your move" tray ------------------------------------------------

  const stepProps: Omit<StepProps, "row"> = {
    viewer,
    onCancel: () => {
      setMode({ k: "idle" });
      setError(null);
    },
    onDone: (message) => void landed(message),
  };

  let tray: ReactNode;
  if (mode.k === "done") {
    const again = row.mine && row.action;
    tray = (
      <TrayFrame tone="ok" label="Done">
        <TrayHead
          text={doneText(row, viewer)}
          note={again ? `That's yours too: ${row.action}.` : null}
          buttons={again ? <Button variant="primary" className={BTN} onClick={act}>{row.action}</Button> : null}
        />
      </TrayFrame>
    );
  } else if (route.rejected) {
    const rj = route.rejected;
    tray = (
      <TrayFrame tone="stop" label="Closed">
        <TrayHead
          text={`Rejected${rj.by ? ` by ${rj.by}` : ""}${rj.at ? ` on ${shortDate(rj.at)}` : ""}.${rj.reason ? ` Reason: ${rj.reason}.` : ""}`}
          note="Rejected requests stay here for the record. File a new request to try again."
        />
      </TrayFrame>
    );
  } else if (route.finished || !step) {
    const last = route.stations.at(-1);
    tray = (
      <TrayFrame tone="ok" label="Closed">
        <TrayHead text={`${stageMeta(route.stage).label}${last?.at ? ` on ${shortDate(last.at)}` : ""}. Nothing left to do.`} />
      </TrayFrame>
    );
  } else if (mode.k === "failed") {
    tray = (
      <TrayFrame tone="stop" label="Sign-off failed">
        <TrayHead
          text={mode.text}
          note="The request remains unchanged. Add stock in Snipe-IT, then try again."
          buttons={
            <>
              <Button variant="secondary" className={BTN} onClick={() => setMode({ k: "idle" })}>
                Close
              </Button>
              <Button variant="primary" className={BTN} onClick={() => void confirm()}>
                Try again
              </Button>
            </>
          }
        />
      </TrayFrame>
    );
  } else if (row.mine || mode.k === "form") {
    const move = yourMove(row, viewer);
    const blocked = route.blocked;
    const alert = error ?? (blocked && mode.k !== "form" ? `Snipe-IT refused the update: ${blocked} Nothing was changed, and the correction stays in your queue until it is resolved.` : null);

    if (mode.k === "confirm" || mode.k === "pending") {
      const c = confirmCopy(row, viewer);
      tray = (
        <TrayFrame tone="mine" label="Confirm">
          {alert && <Alert>{alert}</Alert>}
          <TrayHead
            text={c.question}
            note={c.note}
            buttons={
              mode.k === "pending" ? (
                <PendingButton>{mode.text}</PendingButton>
              ) : (
                <>
                  <Button variant="secondary" className={BTN} onClick={() => setMode({ k: "idle" })}>
                    Cancel
                  </Button>
                  <Button variant="primary" className={BTN} autoFocus onClick={() => void confirm()}>
                    {row.action}
                  </Button>
                </>
              )
            }
          />
        </TrayFrame>
      );
    } else if (mode.k === "form") {
      const Step = STEPS[mode.form];
      const onBehalf = mode.form === "reject" && admin && step === "mgr" && !isApprover(r, viewer.userId, viewer.name);
      const text =
        mode.form === "reject"
          ? onBehalf
            ? `You're rejecting on ${r.manager ?? "the manager"}'s behalf at the manager stage.`
            : `${r.userName} is emailed the reason. This ends the request.`
          : mode.form === "edit"
            ? `Corrects the request in place. It stays at its current step, and ${r.userName} is emailed what changed.`
            : mode.form === "start"
              ? "While their first day is ahead, reminders about this request hold. Nobody is emailed."
              : move.text;
      const formNote = mode.form === "reject" || mode.form === "edit" || mode.form === "start" ? null : move.note;
      tray = (
        <TrayFrame tone="mine" label={FORM_LABEL[mode.form] ?? row.action ?? "Your move"}>
          {alert && <Alert>{alert}</Alert>}
          <TrayHead text={text} note={formNote} />
          <div className="flex flex-col gap-3 border-t border-line2 pt-3.5">
            <Step row={row} {...stepProps} />
          </div>
        </TrayFrame>
      );
    } else {
      const canReject =
        (step === "mgr" && (admin || isApprover(r, viewer.userId, viewer.name))) || (step === "it" && admin);
      tray = (
        <TrayFrame tone="mine" label="Your move">
          {alert && <Alert>{alert}</Alert>}
          <TrayHead
            text={move.text}
            note={move.note}
            buttons={
              <>
                {canReject && (
                  <Button variant="danger" data-tour="requests-reject" className={BTN} onClick={() => setMode({ k: "form", form: "reject" })}>
                    Reject
                  </Button>
                )}
                <Button variant="primary" className={BTN} onClick={act}>
                  {row.action}
                </Button>
              </>
            }
          />
        </TrayFrame>
      );
    }
  } else {
    const h = row.holder;
    tray = (
      <TrayFrame tone="neutral" label="Whose move" meta={`${daysSince(since(route))} days`}>
        {error && <Alert>{error}</Alert>}
        <TrayHead
          holder={
            h && (
              <HolderChip icon={h.icon} className="h-6.5 self-start fs-13">
                {h.label}
                {h.detail}
              </HolderChip>
            )
          }
          text={waitingText(row, viewer)}
        />
      </TrayFrame>
    );
  }

  // ---- the rest of the docket ---------------------------------------------

  const flags: { icon: string; text: string; alert?: boolean }[] = [];
  if (r.startDate && isStartPending(r.startDate)) flags.push({ icon: "event", text: `Starts ${formatStartShort(r.startDate)}` });
  if (r.autoApproved) flags.push({ icon: "verified", text: "Auto-approved" });
  if (r.lastEdit) flags.push({ icon: "edit_note", text: "Edited" });
  if (r.locationMissing && row.open) flags.push({ icon: "location_off", text: "Location missing", alert: true });
  if (route.blocked) flags.push({ icon: "link_off", text: "Blocked", alert: true });

  const menu: { icon: string; label: string; form: FormKind; danger?: boolean }[] = [];
  if (row.open && canEditRequest(r, viewer.role)) menu.push({ icon: "edit", label: "Edit request", form: "edit" });
  // Unlike an edit, a start date can move after checkout: that's when it's
  // holding the reminders back.
  const kind = kindOf(r);
  if (row.open && admin && (kind === "ASSET" || kind === "ACCESSORY")) {
    menu.push({ icon: "event", label: "Set start date", form: "start" });
  }
  if (row.open && ((admin && (step === "mgr" || step === "it")) || (step === "mgr" && isApprover(r, viewer.userId, viewer.name)))) {
    menu.push({ icon: "block", label: "Reject", form: "reject", danger: true });
  }

  const meta = stageMeta(route.stage);
  const title = kind === "CORRECTION" ? `Correction for ${r.userName}` : `${r.categoryName} for ${r.userName}`;
  const sign =
    step && row.open
      ? { text: row.mine ? `Your move · ${row.action}` : `Signs with “${row.action ?? stageMeta(route.stage).label}”`, mine: row.mine }
      : null;
  const facts = factsOf(r);

  return (
    <article data-tour="requests-docket" className="mx-auto max-w-215 rounded-16 border border-line bg-sheet shadow-[0_1px_2px_var(--shade)]">
      <header className="flex items-start gap-3 px-5.5 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <div className="font-mono fs-12 text-mut">#{r.id}</div>
          <h2 className="m-0 mt-1 font-head fs-20 font-medium tracking-head text-tx">{title}</h2>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <IdentityPill accent={kindAccent(r)} className="h-5.5 fs-12 text-tx2">
              {kindLabel(r)}
            </IdentityPill>
            <IdentityPill
              icon="location_on"
              colour={r.userLocationId != null ? siteColours?.[String(r.userLocationId)] ?? undefined : undefined}
              className="h-5.5 fs-12 text-tx2"
            >
              {r.userLocationName?.trim() || "No site"}
            </IdentityPill>
            {flags.map((f) => (
              <Flag key={f.text} icon={f.icon} alert={f.alert}>
                {f.text}
              </Flag>
            ))}
          </div>
        </div>
        <StateChip intent={meta.intent} icon={meta.icon} size="md">
          {meta.label}
        </StateChip>
        {menu.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More actions"
              className="-mt-0.5 grid size-7.5 cursor-pointer place-items-center rounded-8 border border-transparent text-tx3 outline-none hover:bg-hover data-[state=open]:border-strong data-[state=open]:bg-hover focus-visible:outline-2 focus-visible:outline-brand"
            >
              <Icon name="more_horiz" size={20} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-50">
              {menu.map((m) => (
                <DropdownMenuItem
                  key={m.label}
                  icon={m.icon}
                  variant={m.danger ? "danger" : "default"}
                  onSelect={() => {
                    setError(null);
                    setMode({ k: "form", form: m.form });
                  }}
                >
                  {m.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {tray}

      <div className="grid items-start gap-3.5 p-3.5 desk:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section aria-label="Chain of custody" className="rounded-14 bg-tray p-0.75">
          <div className="px-2.5 pt-1.75 pb-1.5 font-title fs-11 font-medium tracking-label text-mut uppercase">
            Chain of custody
          </div>
          <div className="rounded-11 border border-line bg-sheet px-3.5 pt-0.5 pb-1.5">
            <RouteChain
              route={route}
              size="md"
              holder={step ? `${stationHolder(r, step, viewer)} · since ${shortDate(since(route))}` : undefined}
              futureSub={(s) => (s.key === "filed" ? null : stationHolder(r, s.key as StepKey, viewer))}
              sign={sign}
            />
          </div>
        </section>

        <div className="flex flex-col gap-3.5">
          <section aria-label="Request" className="rounded-14 bg-tray p-0.75">
            <div className="px-2.5 pt-1.75 pb-1.5 font-title fs-11 font-medium tracking-label text-mut uppercase">
              Request
            </div>
            <dl className="m-0 rounded-11 border border-line bg-sheet px-3.5 fs-13">
              {facts.map((f, i) => (
                <div key={f.k} className={cn("flex justify-between gap-4 py-2.5", i > 0 && "border-t border-line2")}>
                  <dt className="flex-none text-mut">{f.k}</dt>
                  <dd className={cn("m-0 min-w-0 text-right text-pretty", f.mono && "font-mono fs-12.5")}>{f.v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {r.lastEdit && r.lastEdit.changes.length > 0 && (
            <section aria-label="Last edit" className="rounded-14 bg-tray p-0.75">
              <div className="flex items-center justify-between gap-3 px-2.5 pt-2 pb-1.75 font-title fs-11 font-medium tracking-label text-mut uppercase">
                <span>Last edit</span>
                <span className="font-sans fs-12 font-normal tracking-normal text-tx3 normal-case">
                  {r.lastEdit.editedBy} · {shortDate(r.lastEdit.editedAt)}
                </span>
              </div>
              <div className="overflow-hidden rounded-11 border border-line bg-sheet fs-13">
                {r.lastEdit.changes.map((c, i) => (
                  <div key={c.field} className={cn(i > 0 && "border-t border-line")}>
                    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2.5 px-3.5 py-2.5">
                      <span className="text-mut">{c.label}</span>
                      <span>{c.to || "—"}</span>
                    </div>
                    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2.5 border-t border-line2 bg-[repeating-linear-gradient(135deg,var(--canvas)_0_4px,var(--sheet)_4px_8px)] px-3.5 py-2.5 text-mut">
                      <span>was</span>
                      <span className="line-through">{c.from || "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}
