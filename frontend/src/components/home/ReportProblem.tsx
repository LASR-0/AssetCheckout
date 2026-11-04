import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChoiceChip } from "@/components/ui/pills";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Modal, ModalBody, ModalFooter, ModalHelp, ModalTitle } from "@/components/ui/modal";
import { submitCorrection, type NoLongerHeldReason, type SubmitCorrectionInput } from "@/api/corrections";
import {
  assetCategoriesQuery,
  invalidateWorkflow,
  requestableAccessoryCategoriesQuery,
  troubleshootingSubjectsQuery,
} from "@/api/queries";
import { iconForCategory } from "@/lib/categoryIcon";
import { troubleshootingPathForCategory } from "@/lib/troubleshootingRoutes";
import { whereToFind } from "@/lib/whereToFind";
import { heldDetail, type HeldItem } from "./held";
import { ACTION, ROW } from "./styles";

///  +-----------------------------------------------------------------+
///  |                     REPORT A PROBLEM                            |
///  +-----------------------------------------------------------------+
//
//  The only way corrections get filed (02-workflows.md §F). A step flow in
//  one modal, so Back never loses an answer:
//
//    list     everything of one kind they hold ("See all my devices")
//    choose   what's wrong with the item they picked
//    which    which recorded detail is wrong (serial, model, other)
//    value    what it should be, with where-to-find-it help
//    gone     they don't have it any more, and why
//    else     something else, in their own words
//    missing  something we have no record of at all
//    done
//
//  "It's not working" files nothing: it sends them to that device's
//  troubleshooting, which fixes most problems faster than a ticket.
//
//  SERIALS ARE ASSETS ONLY. Snipe stocks accessories by quantity with no
//  unit serial, so an accessory is never asked for one.
///  +-----------------------------------------------------------------+

export type FlowStart =
  | { step: "list"; subject: "ASSET" | "ACCESSORY" }
  | { step: "choose"; item: HeldItem }
  | { step: "missing" };

type Step = "list" | "choose" | "which" | "value" | "gone" | "else" | "missing" | "done";
type Why = "broken" | "mismatch" | "gone" | "else";
type WrongField = "SERIAL" | "MODEL" | "OTHER";
type MissingCat = { id: number; name: string; subject: "ASSET" | "ACCESSORY" };

type State = {
  step: Step;
  hist: Step[];
  subject: "ASSET" | "ACCESSORY";
  item: HeldItem | null;
  why: Why | null;
  field: WrongField | null;
  val: string;
  notes: string;
  reason: NoLongerHeldReason | null;
  cat: MissingCat | null;
  desc: string;
  serial: string;
};

function initial(start: FlowStart): State {
  return {
    step: start.step,
    hist: [],
    subject: start.step === "list" ? start.subject : start.step === "choose" ? start.item.subject : "ASSET",
    item: start.step === "choose" ? start.item : null,
    why: null,
    field: null,
    val: "",
    notes: "",
    reason: null,
    cat: null,
    desc: "",
    serial: "",
  };
}

const TITLES: Record<Step, string> = {
  list: "",
  choose: "What's wrong with it?",
  which: "Which detail is wrong?",
  value: "Tell us what it should be",
  gone: "You no longer have this",
  else: "What's wrong?",
  missing: "Report a missing item",
  done: "Sent to IT",
};

const WHY: [Why, string][] = [
  ["broken", "It's not working"],
  ["mismatch", "The model or serial doesn't match what I actually have"],
  ["gone", "I no longer have it"],
  ["else", "Something else is wrong"],
];

const GONE: [NoLongerHeldReason, string][] = [
  ["RETURNED", "I returned it"],
  ["LOST", "It was lost or stolen"],
  ["SWAPPED", "I swapped it for something else"],
  ["GAVE_AWAY", "I gave it to someone else"],
  ["OTHER", "Something else"],
];

/** A selectable row with a radio, for the step's single question. */
function Options<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: [T, string][];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <RadioGroup aria-label={label} value={value ?? ""} onValueChange={(v) => onChange(v as T)} className="gap-1.5">
      {options.map(([k, text]) => (
        <label
          key={k}
          className="flex min-h-13 cursor-pointer items-center gap-3 rounded-10 border border-line bg-sheet px-3.5 py-2.5 fs-13 text-tx transition-colors has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand-sub"
        >
          <RadioGroupItem value={k} />
          <span className="min-w-0 flex-1 leading-[1.4]">{text}</span>
        </label>
      ))}
    </RadioGroup>
  );
}

function Field({ label, optional, children }: { label: ReactNode; optional?: boolean; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 fs-11.5 font-medium text-tx2">
      <span>
        {label}
        {optional && <span className="font-normal text-mut"> optional</span>}
      </span>
      {children}
    </label>
  );
}

function ItemCard({ item }: { item: HeldItem }) {
  const d = heldDetail(item);
  return (
    <div className="flex items-center gap-3 rounded-10 border border-line2 bg-subtle px-3 py-2.5">
      <span className="grid size-9 flex-none place-items-center rounded-9 bg-track text-tx2">
        <Icon name={iconForCategory(item.categoryName ?? "")} size={17.5} weight={300} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="fs-12.5 font-medium">{item.title}</span>
        <span className="fs-11 text-mut">
          {d.category}
          {d.id && (
            <>
              {" · "}
              <span className={d.mono ? "font-mono fs-10.5" : undefined}>{d.id}</span>
            </>
          )}
        </span>
      </span>
    </div>
  );
}

type Props = {
  start: FlowStart | null;
  onClose: () => void;
  assets: HeldItem[];
  accessories: HeldItem[];
};

export default function ReportProblem({ start, onClose, assets, accessories }: Props) {
  // Remounted per opening (see the key at the bottom), so each run starts clean.
  if (!start) return null;
  return <Flow key={JSON.stringify(start)} start={start} onClose={onClose} assets={assets} accessories={accessories} />;
}

function Flow({ start, onClose, assets, accessories }: Props & { start: FlowStart }) {
  const navigate = useNavigate();
  const [f, setF] = useState<State>(() => initial(start));
  const [how, setHow] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newId, setNewId] = useState<number | null>(null);

  const subjects = useQuery({ ...troubleshootingSubjectsQuery, enabled: f.step === "choose" });
  const assetCats = useQuery({ ...assetCategoriesQuery, enabled: f.step === "missing" });
  const accessoryCats = useQuery({ ...requestableAccessoryCategoriesQuery, enabled: f.step === "missing" });

  const set = (p: Partial<State>) => setF((s) => ({ ...s, ...p }));
  const go = (step: Step, p?: Partial<State>) => {
    setError(null);
    setF((s) => ({ ...s, ...p, step, hist: [...s.hist, s.step] }));
  };
  const back = () => {
    setError(null);
    setF((s) => {
      const hist = s.hist.slice();
      const step = hist.pop() ?? s.step;
      return { ...s, step, hist };
    });
  };

  const item = f.item;
  const list = f.subject === "ASSET" ? assets : accessories;
  const isSerial = f.step === "value" && f.field === "SERIAL";
  const isOther = f.step === "value" && f.field === "OTHER";
  const guide = whereToFind(item?.categoryName, item?.subject ?? "ASSET");

  async function send(payload: SubmitCorrectionInput) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitCorrection(payload);
      void invalidateWorkflow();
      setNewId(res.request.id);
      setF((s) => ({ ...s, step: "done", hist: [] }));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't send that. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function submit() {
    const base = item && {
      categoryId: item.categoryId ?? 0,
      categoryName: item.categoryName ?? "Unknown",
      subjectKind: item.subject,
      snipeRecordId: item.snipeRecordId,
    };
    const notes = f.notes.trim();
    if (f.step === "missing" && f.cat) {
      return send({
        categoryId: f.cat.id,
        categoryName: f.cat.name,
        correctionKind: "UNLOGGED",
        subjectKind: f.cat.subject,
        serial: f.serial.trim() || null,
        description: f.desc.trim(),
      });
    }
    if (!base || !item) return;
    if (f.step === "gone") {
      return send({
        ...base,
        correctionKind: "NO_LONGER_HELD",
        noLongerHeldReason: f.reason,
        description: notes || `User no longer has “${item.title}”`,
      });
    }
    if (f.step === "else" || isOther) {
      return send({
        ...base,
        correctionKind: "WRONG_MODEL",
        wrongField: "OTHER",
        description: (isOther ? f.val : f.notes).trim(),
      });
    }
    const val = f.val.trim();
    return send({
      ...base,
      correctionKind: "WRONG_MODEL",
      wrongField: f.field,
      correctedModel: f.field === "MODEL" ? val : null,
      serial: f.field === "SERIAL" ? val : null,
      // The backend requires a description; build one from the answer.
      description:
        notes ||
        (f.field === "MODEL"
          ? `Recorded as “${item.title}”; user says the model is “${val}”`
          : `Recorded serial is wrong; user reports “${val}”`),
    });
  }

  // The primary button for this step.
  let primary: { label: string; disabled?: boolean; onClick: () => void } | null = null;
  switch (f.step) {
    case "choose":
      primary =
        f.why === "broken"
          ? {
              label: `Open ${item?.categoryName ?? "device"} troubleshooting`,
              onClick: () => {
                onClose();
                navigate(troubleshootingPathForCategory(subjects.data ?? [], item?.categoryId ?? null));
              },
            }
          : {
              label: "Continue",
              disabled: !f.why,
              onClick: () => go(f.why === "mismatch" ? "which" : (f.why as Step)),
            };
      break;
    case "which":
      primary = { label: "Continue", disabled: !f.field, onClick: () => go("value", { val: "" }) };
      break;
    case "value":
      primary = { label: "Send to IT", disabled: !f.val.trim(), onClick: submit };
      break;
    case "gone":
      primary = { label: "Send to IT", disabled: !f.reason, onClick: submit };
      break;
    case "else":
      primary = { label: "Send to IT", disabled: !f.notes.trim(), onClick: submit };
      break;
    case "missing":
      primary = { label: "Send to IT", disabled: !f.cat || !f.desc.trim(), onClick: submit };
      break;
    case "done":
      primary = { label: "Done", onClick: onClose };
      break;
  }
  const sending = primary?.label === "Send to IT";

  const missingCats: MissingCat[] = [
    ...(assetCats.data ?? []).map((c) => ({ id: c.id, name: c.name, subject: "ASSET" as const })),
    ...(accessoryCats.data ?? []).map((c) => ({ id: c.id, name: c.name, subject: "ACCESSORY" as const })),
  ];

  const title =
    f.step === "list" ? (f.subject === "ASSET" ? "Your devices" : "Your accessories") : TITLES[f.step];

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next && !submitting) onClose();
      }}
      label="Report a problem"
    >
      <ModalBody>
        <ModalTitle>{title}</ModalTitle>

        {item && ["choose", "which", "value", "gone", "else"].includes(f.step) && <ItemCard item={item} />}

        {f.step === "list" && (
          <>
            <div className="flex flex-none flex-col overflow-hidden rounded-10 border border-line">
              {list.length === 0 ? (
                <p className="m-0 p-3.5 fs-12.5 text-tx3">Nothing is assigned to you in our records.</p>
              ) : (
                list.map((h) => {
                  const d = heldDetail(h);
                  return (
                    <button
                      key={h.snipeRecordId}
                      type="button"
                      onClick={() => go("choose", { item: h, why: null })}
                      className={cn(ROW, "grid min-h-14.5 grid-cols-[2.25rem_minmax(0,1fr)_1.25rem] items-center gap-x-3 border-b border-line2 px-3 py-2 last:border-b-0")}
                    >
                      <span className="grid size-9 place-items-center rounded-9 bg-track text-tx2">
                        <Icon name={iconForCategory(h.categoryName ?? "")} size={17.5} weight={300} />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="fs-12.5 font-medium">{h.title}</span>
                        <span className="fs-11 text-mut">
                          {d.category}
                          {d.id && (
                            <>
                              {" · "}
                              <span className={d.mono ? "font-mono fs-10.5" : undefined}>{d.id}</span>
                            </>
                          )}
                        </span>
                      </span>
                      <Icon name="chevron_right" size={16.5} className="text-mut" />
                    </button>
                  );
                })
              )}
            </div>
            <button
              type="button"
              onClick={() => go("missing")}
              className="flex cursor-pointer items-center gap-1.5 self-start rounded-4 border-0 bg-transparent p-0 font-sans fs-12 font-medium text-brand-tx outline-none hover:underline focus-visible:outline-2 focus-visible:outline-brand"
            >
              <Icon name="add_circle" size={15.5} />
              Got something we haven't recorded?
            </button>
          </>
        )}

        {f.step === "choose" && (
          <>
            <Options label="What's wrong with it?" options={WHY} value={f.why} onChange={(why) => set({ why })} />
            {f.why === "broken" && (
              <div className="flex gap-2.5 rounded-10 bg-brand-sub px-3.5 py-3 fs-12 leading-normal text-tx2 shadow-[inset_0_0_0_1px_var(--brand-line)]">
                <Icon name="build" size={17.5} className="text-brand-tx" />
                <span>
                  Work through the troubleshooting steps for this kind of device. Most problems are fixed there in a few
                  minutes.
                </span>
              </div>
            )}
          </>
        )}

        {f.step === "which" && (
          <Options
            label="Which detail is wrong?"
            options={
              item?.subject === "ASSET"
                ? [
                    ["SERIAL", "Serial number"],
                    ["MODEL", "Model name"],
                    ["OTHER", "Something else"],
                  ]
                : [
                    ["MODEL", "Model name"],
                    ["OTHER", "Something else"],
                  ]
            }
            value={f.field}
            onChange={(field) => set({ field })}
          />
        )}

        {f.step === "value" && item && (
          <>
            {!isOther && (
              <p className="m-0 fs-12.5 leading-normal text-tx2">
                We have it recorded as{" "}
                <span className={cn("font-medium text-tx", isSerial && "font-mono")}>
                  ‘{isSerial ? item.serial ?? "no serial" : item.title}’
                </span>
                .
              </p>
            )}
            <Field label={isOther ? "What's wrong with the record?" : isSerial ? "What should the serial be?" : "What should the model be?"}>
              <Input
                size="lg"
                autoFocus
                value={f.val}
                onChange={(e) => set({ val: e.target.value })}
                placeholder={isSerial ? "As printed on the device" : isOther ? "In your own words" : "e.g. ThinkPad T14s Gen 5"}
                className={cn(isSerial && "font-mono tracking-[0.02em]")}
              />
            </Field>
            {isSerial && (
              <Collapsible open={guideOpen} onOpenChange={setGuideOpen} className="flex-none overflow-hidden rounded-10 border border-line">
                <CollapsibleTrigger className="flex min-h-11 w-full cursor-pointer items-center gap-2 border-0 bg-subtle px-3 text-left font-sans fs-12 font-medium text-tx outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand">
                  <Icon name="search" size={16.5} className="text-mut" />
                  <span className="flex-1">Where to find the serial: {guide.title.toLowerCase()}</span>
                  <Icon name={guideOpen ? "expand_less" : "expand_more"} size={17.5} className="text-mut" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ol className="m-0 flex list-decimal flex-col gap-1.5 border-t border-line2 py-3 pr-3.5 pl-8 fs-12 leading-[1.55] text-pretty text-tx2">
                    {guide.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}

        {f.step === "gone" && (
          <>
            <Options label="What happened to it?" options={GONE} value={f.reason} onChange={(reason) => set({ reason })} />
            <div className="flex gap-2 fs-12 leading-normal text-tx3">
              <Icon name="info" size={15.5} className="text-mut" />
              We'll ask IT to take it off your record.
            </div>
          </>
        )}

        {f.step === "missing" && (
          <>
            <p className="m-0 fs-12.5 leading-normal text-tx3">Tell us about an item you have that isn't in our records.</p>
            <div className="flex flex-col gap-2">
              <span className="fs-11.5 font-medium text-tx2">What kind of item is it?</span>
              <div className="flex flex-wrap gap-1.5">
                {missingCats.map((c) => (
                  <ChoiceChip
                    key={`${c.subject}-${c.id}`}
                    icon={iconForCategory(c.name)}
                    selected={f.cat?.id === c.id && f.cat.subject === c.subject}
                    onClick={() => set({ cat: c })}
                    className="h-9.5 fs-12"
                  >
                    {c.name}
                  </ChoiceChip>
                ))}
              </div>
            </div>
            <Field label="Describe it">
              <Input size="lg" value={f.desc} onChange={(e) => set({ desc: e.target.value })} placeholder="e.g. Logitech MX Keys keyboard" />
            </Field>
            <Field label="Serial" optional>
              <Input
                size="lg"
                value={f.serial}
                onChange={(e) => set({ serial: e.target.value })}
                placeholder="If you can find it"
                className="font-mono"
              />
            </Field>
          </>
        )}

        {((f.step === "value" && !isOther) || f.step === "gone" || f.step === "else") && (
          <Field label={f.step === "else" ? "Tell us what is wrong" : "Notes"} optional={f.step !== "else"}>
            <Textarea
              size="lg"
              value={f.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder={f.step === "else" ? "What looks wrong about this item in our records?" : "Anything IT should know"}
              className="min-h-21"
            />
          </Field>
        )}

        {f.step === "done" && (
          <div className="flex flex-col items-start gap-2.5">
            <span className="grid size-11 place-items-center rounded-full bg-ok-bg text-ok">
              <Icon name="check_circle" size={21} fill />
            </span>
            <p className="m-0 fs-13 leading-[1.55] text-pretty text-tx2">
              Thanks — sent to IT. IT will review it and update the record. Nothing else to do.
            </p>
            {newId != null && (
              <p className="m-0 fs-11.5 text-mut">
                It now shows under Where your requests are up to, as <span className="font-mono">#{newId}</span>.
              </p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="m-0 flex gap-2 fs-12 leading-normal text-stop">
            <Icon name="error" size={15.5} />
            {error}
          </p>
        )}

        {how && (
          <p className="m-0 rounded-10 bg-subtle px-3.5 py-3 fs-11.5 leading-[1.55] text-pretty text-tx3">
            This sends a correction straight to IT, with no manager step. IT finds the matching record in Snipe-IT and
            fixes it, or tells you why not.
          </p>
        )}
      </ModalBody>

      <ModalFooter help={<ModalHelp onClick={() => setHow((h) => !h)} aria-expanded={how} />}>
        {f.hist.length > 0 && f.step !== "done" && (
          <Button variant="secondary" className={ACTION} disabled={submitting} onClick={back}>
            Back
          </Button>
        )}
        {primary && (
          <Button
            variant="primary"
            className={cn(ACTION, "px-4.5")}
            disabled={primary.disabled || submitting}
            onClick={primary.onClick}
          >
            {sending && submitting ? "Sending…" : primary.label}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}
