import { useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ROW_IN, rowIn } from "@/lib/motion";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { btn } from "@/components/ui/variants";
import { accessoriesInCategoryQuery, allAccessoryCategoriesQuery, loanConfigQuery } from "@/api/queries";
import { setLoanConfig, type LoanConfig, type LoanDevice } from "@/api/settings";
import { IconButton, Row, SaveNote, Section, Sheet, SnipeDown } from "../parts";
import { Panel } from "../SettingsPanel";
import { draftChip, useSave } from "../saveStatus";

///  +-----------------------------------------------------------------+
///  |                  LOANS                                          |
///  +-----------------------------------------------------------------+
//
//  The devices people can borrow, in the order the loan form lists them,
//  then how long a booking may run and when the due-back reminders go.
//
//  AN EMPTY LIST TURNS LOANS OFF, so the page says so in a banner, and
//  removing the last device asks first. Loans already out aren't affected.
//
//  Reordering and removing save straight away; editing a device (or adding
//  one) opens on the right and waits for Save changes.
///  +-----------------------------------------------------------------+

const BLANK: LoanDevice = { kind: "ACCESSORY", snipeId: 0, categoryId: null, displayName: "", description: null, showEventName: false };

const RUNG = ["First reminder", "Second reminder", "Third reminder", "Fourth reminder"];

function readOffset(v: string): string {
  const n = Number(v);
  if (v === "" || v === "-" || !Number.isInteger(n)) return "";
  return n === 0 ? "on the due date" : n < 0 ? `${-n} day${n < -1 ? "s" : ""} before` : `${n} day${n > 1 ? "s" : ""} after`;
}

export function Loans() {
  const client = useQueryClient();
  const { save } = useSave();
  const config = useQuery(loanConfigQuery);
  const cats = useQuery(allAccessoryCategoriesQuery);
  const devices = config.data?.devices ?? [];
  const [confirmLast, setConfirmLast] = useState(false);

  const deviceCats = [...new Set(devices.map((d) => d.categoryId).filter((c): c is number => c != null))];
  const recordQs = useQueries({ queries: deviceCats.map((c) => accessoriesInCategoryQuery(c)) });
  const recordName = (d: LoanDevice) => {
    const i = deviceCats.indexOf(d.categoryId ?? -1);
    return recordQs[i]?.data?.find((r) => r.id === d.snipeId)?.name ?? null;
  };
  const catName = (id: number | null | undefined) => cats.data?.find((c) => c.id === id)?.name ?? null;

  /** Save part of the config, showing it at once and putting it back on failure. */
  const commit = (key: string, patch: Partial<LoanConfig>) => {
    const before = config.data;
    client.setQueryData(loanConfigQuery.queryKey, (c: LoanConfig | undefined) => (c ? { ...c, ...patch } : c));
    return save(key, async () => {
      try {
        client.setQueryData(loanConfigQuery.queryKey, await setLoanConfig(patch));
      } catch (err) {
        client.setQueryData(loanConfigQuery.queryKey, before);
        throw err;
      }
    });
  };

  const move = (i: number, by: -1 | 1) => {
    const next = [...devices];
    const [d] = next.splice(i, 1);
    next.splice(i + by, 0, d);
    void commit("dev", { devices: next });
  };
  const remove = (i: number) => {
    if (devices.length === 1) return setConfirmLast(true);
    if (editing === i) setEditing(null);
    void commit("dev", { devices: devices.filter((_, j) => j !== i) });
  };

  // ── Editing a device ─────────────────────────────────────────────────
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<LoanDevice | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  // Kept while the panel slides out, so it still has something to show.
  const [last, setLast] = useState(editing);
  if (editing != null && editing !== last) setLast(editing);
  const target = editing ?? last;
  const saved = target === "new" ? null : target != null ? devices[target] : null;
  const current = draft ?? saved ?? BLANK;
  const dirty = editing === "new" ? true : editing != null && !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  const patch = (p: Partial<LoanDevice>) => {
    setState("idle");
    setDraft({ ...current, ...p });
  };
  const ready = !!current.displayName.trim() && current.snipeId > 0;

  async function saveDevice() {
    if (!ready) return setState("failed");
    setState("saving");
    const d = { ...current, displayName: current.displayName.trim(), description: current.description?.trim() || null };
    const next = editing === "new" ? [...devices, d] : devices.map((x, i) => (i === editing ? d : x));
    try {
      const out = await setLoanConfig({ devices: next });
      client.setQueryData(loanConfigQuery.queryKey, out);
      setDraft(null);
      setState("idle");
      if (editing === "new") setEditing(out.devices.length - 1);
    } catch {
      setState("failed");
    }
  }

  const open = (i: number | "new") => {
    setEditing(i);
    setDraft(i === "new" ? { ...BLANK } : null);
    setState("idle");
  };

  const records = useQuery({ ...accessoriesInCategoryQuery(current.categoryId ?? 0), enabled: target != null && current.categoryId != null });

  return (
    <>
      {config.isSuccess && !devices.length && (
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-11 bg-prog-bg px-3.5 py-2.75 fs-11.5 text-tx shadow-[inset_0_0_0_1px_var(--prog-line)]">
          <Icon name="pause_circle" size={16.5} className="text-prog" />
          <span className="flex-[1_1_15rem]">
            <b className="font-semibold">Loans are currently disabled.</b> The loan form is hidden until you add a device.
          </span>
          <button type="button" onClick={() => open("new")} className={btn({ size: "sm", className: "h-7.5 rounded-8 fs-11" })}>
            Add device
          </button>
        </div>
      )}

      <Section
        label={`Loanable devices · ${devices.length}`}
       
        note={
          <>
            <SaveNote k="dev" />
            <button type="button" onClick={() => open("new")} className={btn({ variant: "ghost", size: "sm", className: "-my-1 h-7 pr-2.25 pl-1.5 fs-11 text-tx2" })}>
              <Icon name="add" size={15} />
              Add device
            </button>
          </>
        }
      >
        <Sheet className="overflow-hidden">
          <div className="px-4 py-3 fs-11 leading-[1.45] text-tx3">
            The order here is the order on the loan form. Reordering and removing save straight away; editing a device opens on the right. Removing a
            device doesn&rsquo;t affect loans already out.
          </div>
          {devices.map((d, i) => {
            const sel = editing === i;
            const src = [catName(d.categoryId), recordName(d)].filter(Boolean).join(" · ");
            return (
              <div
                key={d.id ?? i}
                style={rowIn(i)}
                className={cn(
                  "grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-line2 py-2.5 pr-3 pl-2.5",
                  ROW_IN,
                  sel && "bg-brand-sub shadow-[inset_3px_0_0_var(--brand)]"
                )}
              >
                <div className="flex flex-col gap-0.5">
                  <IconButton size="sm" icon="keyboard_arrow_up" label="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton size="sm" icon="keyboard_arrow_down" label="Move down" disabled={i === devices.length - 1} onClick={() => move(i, 1)} />
                </div>
                <button type="button" onClick={() => open(i)} className="min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left font-sans text-tx outline-none focus-visible:underline">
                  <span className="flex items-center gap-2">
                    <span className="fs-12 font-medium">{d.displayName}</span>
                    {d.showEventName && (
                      <span className="inline-flex items-center gap-0.75 fs-10.5 text-mut">
                        <Icon name="event" size={12} />
                        Asks for event name
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate fs-11 text-tx3">{d.description || "No help text"}</span>
                  <span className="mt-0.5 block truncate fs-10.5 text-mut">{src || "No Snipe-IT record picked"}</span>
                </button>
                <IconButton icon="delete" label="Remove device" danger onClick={() => remove(i)} />
                <button type="button" onClick={() => open(i)} aria-label={`Edit ${d.displayName}`} className="cursor-pointer border-0 bg-transparent p-0 text-mut">
                  <Icon name="chevron_right" size={15.5} />
                </button>
              </div>
            );
          })}
          {confirmLast && devices.length === 1 && (
            <div className="mx-3 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-10 bg-stop-bg px-3.5 py-3 fs-11.5 leading-[1.45] text-tx shadow-[inset_0_0_0_1px_var(--stop-line)]">
              <Icon name="warning" size={15.5} className="text-stop" />
              <span className="flex-[1_1_15rem]">Removing {devices[0].displayName} turns loans off for everyone. Loans already out aren&rsquo;t affected.</span>
              <button type="button" onClick={() => setConfirmLast(false)} className={btn({ size: "sm", className: "h-8 rounded-8 fs-11" })}>
                Keep it
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmLast(false);
                  setEditing(null);
                  void commit("dev", { devices: [] });
                }}
                className={btn({ variant: "danger", size: "sm", className: "h-8 rounded-8 fs-11" })}
              >
                Remove and turn off loans
              </button>
            </div>
          )}
          {config.isSuccess && !devices.length && (
            <div className="border-t border-line2 px-4 py-3.5 fs-11.5 text-tx3">No devices, so loans are off. Add a device to turn them on.</div>
          )}
        </Sheet>
      </Section>

      {config.data && <Bookings config={config.data} commit={commit} />}

      {target != null && (
        <Panel
          open={editing != null}
          onClose={() => {
            setEditing(null);
            setDraft(null);
          }}
          backLabel="Loans"
          kicker={target === "new" ? "New loanable device" : `Loanable device · ${target + 1} of ${devices.length}`}
          title={current.displayName.trim() || "New device"}
          chip={draftChip(state, dirty)}
          notices={
            <>
              {state === "failed" && (
                <SnipeDown onRetry={() => void saveDevice()}>
                  {ready ? "Couldn't save. Your edits are still here; try Save changes again." : "A device needs a name and a Snipe-IT record before it can save."}
                </SnipeDown>
              )}
              {cats.isError && (
                <SnipeDown onRetry={() => void cats.refetch()}>
                  Couldn&rsquo;t load categories from Snipe-IT. Name, help text and the event toggle still edit.
                </SnipeDown>
              )}
            </>
          }
          foot={{
            text: dirty ? "Unsaved changes" : "No unsaved changes",
            dirty,
            saving: state === "saving",
            onDiscard: () => {
              setState("idle");
              if (editing === "new") setEditing(null);
              setDraft(null);
            },
            onSave: () => void saveDevice(),
          }}
        >
          <Section label="On the loan form">
            <Sheet className="flex flex-col gap-3 p-3.5">
              <label className="flex flex-col gap-1.25 fs-11 text-tx3">
                Name on the form
                <Input value={current.displayName} onChange={(e) => patch({ displayName: e.target.value })} placeholder="e.g. KVM" className="fs-11.5" />
              </label>
              <label className="flex flex-col gap-1.25 fs-11 text-tx3">
                Help text
                <Input value={current.description ?? ""} onChange={(e) => patch({ description: e.target.value })} placeholder="e.g. For remote support of iPads" className="fs-11.5" />
                <span className="fs-10.5 text-mut">Optional. Shown under the name.</span>
              </label>
              <div className="flex items-center justify-between gap-4 border-t border-line2 pt-3">
                <span>
                  <span className="block fs-11.5 font-medium">Ask for an event name</span>
                  <span className="mt-0.5 block fs-11 text-mut">Adds a required &ldquo;Event&rdquo; field to the form.</span>
                </span>
                <Switch aria-label="Ask for an event name" checked={current.showEventName} onCheckedChange={(on) => patch({ showEventName: on })} />
              </div>
            </Sheet>
          </Section>
          <Section label="Snipe-IT record">
            <Sheet className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2.5 p-3.5">
              <label className="flex min-w-0 flex-col gap-1.25 fs-11 text-tx3">
                Accessory category
                <Select
                  value={current.categoryId != null ? String(current.categoryId) : undefined}
                  onValueChange={(v) => patch({ categoryId: Number(v), snipeId: 0 })}
                  disabled={cats.isError}
                >
                  <SelectTrigger aria-label="Accessory category" className="w-full min-w-0 fs-11.5">
                    <SelectValue placeholder="Pick a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(cats.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="flex min-w-0 flex-col gap-1.25 fs-11 text-tx3">
                Record
                <Select value={current.snipeId ? String(current.snipeId) : undefined} onValueChange={(v) => patch({ snipeId: Number(v) })} disabled={current.categoryId == null || !records.data}>
                  <SelectTrigger aria-label="Record" className="w-full min-w-0 fs-11.5">
                    <SelectValue placeholder={current.categoryId == null ? "Pick a category first" : "Pick a record"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(records.data ?? []).map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name}
                        {r.locationName ? ` · ${r.locationName}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </Sheet>
          </Section>
        </Panel>
      )}
    </>
  );
}

function Bookings({ config, commit }: { config: LoanConfig; commit: (key: string, patch: Partial<LoanConfig>) => Promise<boolean> }) {
  const [days, setDays] = useState<string | null>(null);
  const [rungs, setRungs] = useState<string[] | null>(null);
  const shownDays = days ?? String(config.maxLoanDays);
  const shownRungs = rungs ?? config.reminderDays.map(String);
  const nums = shownRungs.map(Number);
  const climbing = nums.every((n, i) => Number.isInteger(n) && shownRungs[i] !== "" && (i === 0 || n > nums[i - 1]));

  const saveDays = () => {
    const n = Number(shownDays);
    if (days == null || !Number.isInteger(n) || n <= 0 || n === config.maxLoanDays) return setDays(null);
    void commit("max", { maxLoanDays: n }).then(() => setDays(null));
  };
  const saveRungs = () => {
    if (rungs == null) return;
    if (!climbing) return;
    if (nums.join() === config.reminderDays.join()) return setRungs(null);
    void commit("offs", { reminderDays: nums }).then(() => setRungs(null));
  };

  return (
    <Section label="Bookings and reminders" note="Saves as you go">
      <Sheet>
        <Row title="Longest booking" desc="The furthest due date a requester can pick.">
          <label className="flex items-center gap-2 fs-11.5 text-tx3">
            <Input
              value={shownDays}
              inputMode="numeric"
              onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 3))}
              onBlur={saveDays}
              aria-label="Longest booking in days"
              className="w-18 text-right fs-11.5"
            />
            days
          </label>
          <SaveNote k="max" />
        </Row>
        <div className="flex flex-col gap-3 border-t border-line2 px-4 py-3.5">
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-[1_1_16.25rem]">
              <div className="fs-11.5 font-medium">Due-back reminders</div>
              <div className="mt-0.75 fs-11 leading-[1.45] text-pretty text-mut">
                Days relative to the due date. Negative is before, 0 is the day itself. Sent by the Loan due-back reminders job; changes apply
                immediately.
              </div>
            </div>
            <SaveNote k="offs" />
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(8.125rem,1fr))] gap-2.5">
            {shownRungs.map((v, i) => (
              <label key={i} className="flex flex-col gap-1.25 fs-11 text-tx3">
                {RUNG[i]}
                <span className="flex items-center gap-2">
                  <Input
                    value={v}
                    inputMode="numeric"
                    aria-invalid={rungs != null && !climbing ? true : undefined}
                    onChange={(e) => {
                      const next = [...shownRungs];
                      next[i] = e.target.value.replace(/[^-\d]/g, "").slice(0, 3);
                      setRungs(next);
                    }}
                    onBlur={saveRungs}
                    className="w-18 text-right fs-11.5"
                  />
                  <span className="fs-11 text-mut">{readOffset(v)}</span>
                </span>
              </label>
            ))}
          </div>
          {rungs != null && !climbing && <span className="fs-11 text-stop">Each reminder has to come after the one before it.</span>}
        </div>
      </Sheet>
    </Section>
  );
}
