import { useState, type ComponentProps, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ROW_IN, rowIn } from "@/lib/motion";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { btn } from "@/components/ui/variants";
import { accessoriesInCategoryQuery, accessoryAssetMapQuery, accessorySettingsQuery } from "@/api/queries";
import { setRequestableAccessoryCategoryIds, setStandardAccessoriesForCategory } from "@/api/accessories";
import { setAccessoryCategoriesForAssetCategory } from "@/api/settings";
import { findProductBySavedId, groupAccessoryProducts } from "@/lib/accessoryProducts";
import type { AccessoryOptionConfig, AccessorySettings } from "@/types/accessoriesType";
import { Aside, ChipToggle, Hint, HowThisWorks, IconButton, SaveNote, Section, Sheet, SnipeDown } from "../parts";
import { Panel } from "../SettingsPanel";
import { draftChip, useSave } from "../saveStatus";
import { idDot, useAccessoryPipeline, type CategoryHealth } from "../accessoryPipeline";

///  +-----------------------------------------------------------------+
///  |                  ACCESSORIES                                    |
///  +-----------------------------------------------------------------+
//
//  Three layers decide who can request an accessory (see accessoryPipeline),
//  so the page is the three layers as steps, in the order they're set up,
//  with the health of every category above them. "Why can't anyone request
//  Cases?" is answered at the top, with the fix one click away.
//
//  Steps 1 and 3 save as you go. Step 2's options are an editor and open on
//  the right, holding their edits until Save changes.
///  +-----------------------------------------------------------------+

function Rail({ h }: { h: CategoryHealth }) {
  const dot = (k: "ok" | "bad" | "idle") =>
    cn(
      "size-2.25 flex-none rounded-full",
      k === "ok" ? "bg-ok" : k === "bad" ? "border-2 border-stop bg-stop-bg" : "border-[1.5px] border-strong bg-sheet"
    );
  const line = (k: "ok" | "bad") => cn("w-3 border-t-2", k === "ok" ? "border-ok" : "border-dashed border-stop");
  return (
    <div title="Requestable · Options · Mapped" className="flex items-center pt-1.25">
      <span className={dot(h.requestable ? "ok" : "bad")} />
      <span className={line(h.requestable ? "ok" : "bad")} />
      <span className={dot(h.options ? "ok" : "idle")} />
      <span className={line(h.requestable && h.mappedBy.length ? "ok" : "bad")} />
      <span className={dot(h.mappedBy.length ? "ok" : "bad")} />
    </div>
  );
}

export function Accessories() {
  const client = useQueryClient();
  const { save } = useSave();
  const p = useAccessoryPipeline();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [retrying, setRetrying] = useState(false);

  const allCount = p.categories.length;
  const reqList = p.reqIds ?? [];
  const nameOf = (id: number) => p.categories.find((c) => c.id === id)?.name ?? `Category ${id}`;

  const retry = () => {
    setRetrying(true);
    void p.refetch().finally(() => setRetrying(false));
  };

  // ── Layer 1 ──────────────────────────────────────────────────────────
  const setRequestable = (next: number[]) => {
    const before = client.getQueryData(accessorySettingsQuery.queryKey);
    client.setQueryData(accessorySettingsQuery.queryKey, (s: AccessorySettings | undefined) => (s ? { ...s, requestableCategoryIds: next } : s));
    void save("accReq", async () => {
      try {
        await setRequestableAccessoryCategoryIds(next);
      } catch (err) {
        client.setQueryData(accessorySettingsQuery.queryKey, before);
        throw err;
      }
    });
  };
  const toggleRequestable = (id: number) => setRequestable(reqList.includes(id) ? reqList.filter((x) => x !== id) : [...reqList, id]);

  // ── Layer 3 ──────────────────────────────────────────────────────────
  const setMapping = (assetId: number, next: number[]) => {
    const before = p.mapping;
    client.setQueryData(accessoryAssetMapQuery.queryKey, { ...before, [String(assetId)]: next });
    void save("map", async () => {
      try {
        client.setQueryData(accessoryAssetMapQuery.queryKey, await setAccessoryCategoriesForAssetCategory(assetId, next));
      } catch (err) {
        client.setQueryData(accessoryAssetMapQuery.queryKey, before);
        throw err;
      }
    });
  };
  const removeEverywhere = (h: CategoryHealth) => {
    for (const a of p.assetRows) {
      const m = p.mapping[String(a.id)] ?? [];
      if (m.includes(h.id)) setMapping(a.id, m.filter((x) => x !== h.id));
    }
    setStep(3);
  };

  // ── Layer 2: the options panel ───────────────────────────────────────
  const [open, setOpen] = useState<number | null>(null);
  const [openRow, setOpenRow] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, AccessoryOptionConfig[]>>({});
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  const savedOpts = (id: number) => p.options[String(id)]?.options ?? [];
  const optsOf = (id: number) => drafts[id] ?? savedOpts(id);
  const dirtyIds = Object.keys(drafts)
    .map(Number)
    .filter((id) => JSON.stringify(drafts[id]) !== JSON.stringify(savedOpts(id)));
  const edit = (id: number, fn: (list: AccessoryOptionConfig[]) => AccessoryOptionConfig[]) => {
    setState("idle");
    setDrafts((d) => ({ ...d, [id]: fn(structuredClone(d[id] ?? savedOpts(id))) }));
  };

  async function saveDrafts() {
    setState("saving");
    try {
      for (const id of dirtyIds) {
        // Options with no label can't be shown to requesters, so they go.
        const clean = drafts[id]
          .map((o) => ({
            ...o,
            label: o.label.trim(),
            displayLabel: o.displayLabel?.trim() || null,
            accessoryLabel: o.accessoryLabel?.trim() || null,
          }))
          .filter((o) => o.label);
        await setStandardAccessoriesForCategory(id, clean);
      }
      setDrafts({});
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  const reqCats = p.categories.filter((c) => p.reqSet.has(c.id));
  const ok = p.health.filter((h) => h.state === "ok");
  const off = p.health.filter((h) => h.state === "off");
  const L1issue = p.health.some((h) => h.state === "stale");
  const L3issue = p.issues.length > 0 || p.blockedAssets.length > 0;

  const STEPS = [
    { n: 1, label: "Requestable", sub: reqList.length ? `${reqList.length} of ${allCount} allowed` : `All ${allCount} allowed`, issue: L1issue },
    { n: 2, label: "Options", sub: `${reqCats.length} categories`, issue: false },
    { n: 3, label: "Availability by asset", sub: `${p.assetRows.length} asset categories`, issue: L3issue },
  ] as const;

  return (
    <>
      {p.snipeDown && (
        <SnipeDown onRetry={retry} retrying={retrying}>
          <b className="font-semibold">Can&rsquo;t reach Snipe-IT.</b> Lists that come from it can&rsquo;t load. Settings stored in Checkout still save.
        </SnipeDown>
      )}

      <Section label="Health" note={p.issues.length ? `${ok.length} OK · ${p.issues.length} need attention` : `${ok.length} OK`}>
        <Sheet className="overflow-hidden">
          {p.issues.map((h, i) => (
            <div
              key={h.id}
              className={cn("grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-3.5 gap-y-2.5 py-3 pr-3.5 pl-4 desk:grid-cols-[3.5rem_minmax(0,1fr)_auto]", i > 0 && "border-t border-line2")}
            >
              <Rail h={h} />
              <div className="min-w-0">
                <div className="fs-11.5 font-medium">{h.name}</div>
                <div className="mt-0.5 flex gap-1.25 fs-11 leading-[1.45] text-stop">
                  <Icon name="error" size={13} className="leading-4.5" />
                  <span className="text-pretty text-tx3">
                    {h.state === "unmapped"
                      ? "Requestable, but no asset category maps to it, so nobody can see it."
                      : `Mapped on ${h.mappedBy.join(", ")}, but not in the requestable list. Its chip there is stale.`}
                  </span>
                </div>
              </div>
              <div className="col-start-2 flex flex-wrap gap-1.5 desk:col-start-auto desk:justify-end">
                {h.state === "unmapped" ? (
                  <button type="button" onClick={() => setStep(3)} className={btn({ size: "sm", className: "h-7.5 rounded-8 fs-11" })}>
                    Map in step 3
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setRequestable([...reqList, h.id]);
                        setStep(1);
                      }}
                      className={btn({ size: "sm", className: "h-7.5 rounded-8 fs-11" })}
                    >
                      Make requestable
                    </button>
                    <button type="button" onClick={() => removeEverywhere(h)} className={btn({ size: "sm", className: "h-7.5 rounded-8 fs-11" })}>
                      Remove chip
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          <div className={cn("flex flex-col gap-2 px-4 py-3", p.issues.length > 0 && "border-t border-line2 bg-subtle")}>
            <div className="flex items-center gap-1.5 fs-11 whitespace-nowrap text-tx3">
              <Icon name="check_circle" size={14} fill className="text-ok" />
              {p.issues.length ? `${ok.length} visible to someone` : `All ${ok.length} requestable categories are visible to someone`}
            </div>
            {ok.length > 0 && (
              <div className="flex flex-wrap gap-1.25">
                {ok.map((h) => (
                  <span key={h.id} className="inline-flex h-5.5 items-center gap-1.5 rounded-pill border border-line bg-sheet px-2 fs-10.5 text-tx2">
                    <span className={cn("size-1.75 rounded-full", idDot(h.name))} />
                    {h.name}
                  </span>
                ))}
              </div>
            )}
            {off.length > 0 && <div className="fs-10.5 text-mut">Off, neither requestable nor mapped: {off.map((h) => h.name).join(", ")}</div>}
          </div>
        </Sheet>
      </Section>

      <div role="tablist" aria-label="Setup steps" className="grid grid-cols-3 gap-0.5 rounded-12 bg-track p-0.75">
        {STEPS.map((s) => {
          const on = step === s.n;
          return (
            <button
              key={s.n}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setStep(s.n);
                setOpen(null);
              }}
              className={cn(
                "flex min-w-0 cursor-pointer items-center gap-2.5 rounded-9 border-0 p-2 text-left font-sans text-tx outline-none focus-visible:outline-2 focus-visible:outline-brand desk:px-3 desk:py-2.25",
                on ? "bg-sheet shadow-[0_0_0_1px_var(--line)]" : "bg-transparent hover:bg-hover"
              )}
            >
              <span
                className={cn(
                  "hidden size-5.5 flex-none place-items-center rounded-full font-title fs-10 font-medium desk:grid",
                  on ? "bg-ink text-on-ink" : "bg-sheet text-tx3 shadow-[inset_0_0_0_1px_var(--strong)]"
                )}
              >
                {s.n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.25 truncate fs-11.5 font-medium">
                  {s.label}
                  {s.issue && <Icon name="error" size={13} className="text-stop" />}
                </span>
                <span className="mt-px block truncate fs-10.5 text-mut">{s.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      {step === 1 && (
        <Section label="Step 1 · Requestable" note="Saves as you go">
          <Sheet>
            <div className="flex flex-col gap-3 px-4 py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 flex-[1_1_16.25rem]">
                  <div className="fs-11.5 font-medium">Accessory categories people can request</div>
                  <div className="mt-0.75 fs-11 leading-[1.45] text-pretty text-mut">
                    A site-wide filter. Turning a category on shows it to nobody until step 3 maps it.
                  </div>
                </div>
                <Hint tone="tray" icon="all_inclusive">
                  Empty means everything is allowed
                </Hint>
              </div>
              {!p.snipeDown ? (
                <div className="flex flex-wrap gap-1.5">
                  {p.categories.map((c) => (
                    <ChipToggle key={c.id} on={reqList.includes(c.id)} onClick={() => toggleRequestable(c.id)}>
                      {c.name}
                    </ChipToggle>
                  ))}
                </div>
              ) : (
                <SnipeDown onRetry={retry} retrying={retrying}>
                  Couldn&rsquo;t load categories. {reqList.length ? `${reqList.length} allowed` : "Everything allowed"} as last saved.
                </SnipeDown>
              )}
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-1.5 fs-10.5 text-mut">
                <span>{reqList.length ? `${reqList.length} of ${allCount} allowed` : `All ${allCount} allowed (no restriction)`}</span>
                <SaveNote k="accReq" />
              </div>
            </div>
            <HowThisWorks label="How the three layers work" bar>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(11.25rem,1fr))] gap-2.5 px-4 pb-3.5">
                <Layer n="1 · Requestable">Filters the whole site. It never grants visibility.</Layer>
                <Layer n="2 · Options">The named choices on the form. Optional: with none, the first in-stock item is issued.</Layer>
                <Layer n="3 · Availability">The gate. A category shows only to holders of the asset categories it&rsquo;s mapped to.</Layer>
              </div>
            </HowThisWorks>
          </Sheet>
        </Section>
      )}

      {step === 2 && (
        <Section label="Step 2 · Standard options" note={dirtyIds.length ? `${dirtyIds.length} unsaved · Save in the panel` : "Opens on the right · Save when done"}>
          <Sheet className="overflow-hidden">
            <div className="px-4 py-3 fs-11 leading-[1.45] text-tx3">
              Named choices requesters pick from. Only requestable categories appear here. &ldquo;Something else&rdquo; is always offered, so you
              don&rsquo;t add it.
            </div>
            {reqCats.map((c, i) => {
              const list = optsOf(c.id);
              const sel = open === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setOpen(c.id);
                    setOpenRow(0);
                  }}
                  style={rowIn(i)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 border-0 border-t border-line2 bg-transparent py-2.75 pr-3.5 pl-4 text-left font-sans text-tx outline-none hover:bg-subtle focus-visible:bg-subtle",
                    ROW_IN,
                    sel && "bg-brand-sub shadow-[inset_3px_0_0_var(--brand)] hover:bg-brand-sub"
                  )}
                >
                  <span className={cn("size-1.75 flex-none rounded-full", idDot(c.name))} />
                  <span className="min-w-0 flex-1">
                    <span className="block fs-11.5 font-medium">{c.name}</span>
                    <span className="mt-0.5 block truncate fs-10.5 text-mut">
                      {list.length
                        ? `${list.length} option${list.length > 1 ? "s" : ""} · ${list.map((o) => o.label || "Untitled").join(", ")}`
                        : "No options, so it issues the first in-stock item"}
                    </span>
                  </span>
                  {dirtyIds.includes(c.id) && (
                    <span className="inline-flex items-center gap-1 fs-10.5 text-prog">
                      <Icon name="edit" size={13} />
                      Unsaved
                    </span>
                  )}
                  <Icon name="chevron_right" size={15.5} className="text-mut" />
                </button>
              );
            })}
          </Sheet>
        </Section>
      )}

      {step === 3 && (
        <Section label="Step 3 · Availability by asset" note="Saves as you go">
          <Sheet className="overflow-hidden">
            <div className="flex flex-wrap justify-between gap-x-3.5 gap-y-1.5 px-4 py-3 fs-11 leading-[1.45] text-tx3">
              <span className="flex-[1_1_18.75rem] text-pretty">
                This layer is the gate. Holders of each asset category can request the accessory categories mapped to it. Click a chip to add or
                remove it.
              </span>
              <SaveNote k="map" />
            </div>
            {p.assetRows.map((a) => {
              const m = p.mapping[String(a.id)] ?? [];
              const live = m.filter((id) => p.reqSet.has(id)).length;
              return (
                <div key={a.id} className="grid grid-cols-1 gap-x-4 gap-y-2 border-t border-line2 px-4 py-3.25 desk:grid-cols-[11.25rem_minmax(0,1fr)]">
                  <div>
                    <div className="fs-11.5 font-medium">{a.name}</div>
                    <div className="mt-0.5 fs-10.5 text-mut">{live ? `Can request ${live}` : "Can request none"}</div>
                  </div>
                  <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {m.map((id) =>
                        p.reqSet.has(id) ? (
                          <MapChip key={id} onClick={() => setMapping(a.id, m.filter((x) => x !== id))} title="Remove">
                            <span className={cn("size-1.75 rounded-full", idDot(nameOf(id)))} />
                            {nameOf(id)}
                            <Icon name="close" size={12} className="opacity-70" />
                          </MapChip>
                        ) : (
                          <MapChip key={id} stale onClick={() => setMapping(a.id, m.filter((x) => x !== id))} title="Stale chip. Click to remove.">
                            <Icon name="warning" size={13} />
                            {nameOf(id)} · not requestable
                            <Icon name="close" size={12} className="opacity-70" />
                          </MapChip>
                        )
                      )}
                      {reqCats
                        .filter((c) => !m.includes(c.id))
                        .map((c) => (
                          <MapChip key={c.id} add onClick={() => setMapping(a.id, [...m, c.id])} title="Add">
                            <Icon name="add" size={13} />
                            {c.name}
                          </MapChip>
                        ))}
                    </div>
                    {live === 0 && (
                      <div className="flex gap-1.25 fs-11 text-stop">
                        <Icon name="block" size={13} />
                        <span className="text-tx3">Nothing mapped, so {a.name} holders can&rsquo;t request any accessory.</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="border-t border-line2 bg-subtle px-4 py-2.75 fs-10.5 text-pretty text-mut">
              {p.hiddenAssets.length
                ? `Not shown: ${p.hiddenAssets.map((a) => a.name).join(", ")} aren't requestable asset categories. Their mappings are kept.`
                : "Every asset category is requestable."}
            </div>
          </Sheet>
        </Section>
      )}

      <div className="flex justify-between gap-2">
        {step > 1 && (
          <button type="button" onClick={() => setStep((step - 1) as 1 | 2)} className={btn({ variant: "ghost", size: "md", className: "h-8 pr-3 pl-2 fs-11.5 text-tx2" })}>
            <Icon name="arrow_back" size={15.5} />
            {step === 2 ? "Requestable" : "Options"}
          </button>
        )}
        <span className="flex-1" />
        {step < 3 && (
          <button type="button" onClick={() => setStep((step + 1) as 2 | 3)} className={btn({ size: "md", className: "h-8 pr-2 pl-3 fs-11.5" })}>
            {step === 1 ? "Next: Options" : "Next: Availability by asset"}
            <Icon name="arrow_forward" size={15.5} />
          </button>
        )}
      </div>

      {open != null && (
        <Panel
          open
          onClose={() => setOpen(null)}
          backLabel="Accessories"
          kicker="Standard options · step 2"
          title={nameOf(open)}
          chip={draftChip(state, dirtyIds.includes(open))}
          notices={
            <>
              {state === "failed" && <SnipeDown onRetry={() => void saveDrafts()}>Couldn&rsquo;t save. Your edits are still here; try Save changes again.</SnipeDown>}
            </>
          }
          foot={{
            text: dirtyIds.length ? `${dirtyIds.length} ${dirtyIds.length === 1 ? "category has" : "categories have"} unsaved changes` : "No unsaved changes",
            dirty: dirtyIds.length > 0,
            saving: state === "saving",
            onDiscard: () => {
              setDrafts({});
              setState("idle");
            },
            onSave: () => void saveDrafts(),
          }}
        >
          <OptionsEditor
            categoryId={open}
            list={optsOf(open)}
            openRow={openRow}
            onOpenRow={setOpenRow}
            onEdit={(fn) => edit(open, fn)}
          />
        </Panel>
      )}
    </>
  );
}

function Layer({ n, children }: { n: string; children: ReactNode }) {
  return (
    <Aside>
      <div className="mb-0.75 font-semibold text-tx">{n}</div>
      {children}
    </Aside>
  );
}

function MapChip({ stale, add, className, ...props }: ComponentProps<"button"> & { stale?: boolean; add?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 cursor-pointer items-center gap-1.25 rounded-pill border font-sans fs-11 outline-none focus-visible:outline-2 focus-visible:outline-brand",
        stale
          ? "border-stop-line bg-stop-bg px-1.75 font-medium text-stop"
          : add
            ? "border-dashed border-strong bg-transparent pr-2.5 pl-1.5 text-mut hover:text-tx"
            : "border-line bg-sheet pr-1.75 pl-2.25 text-tx2 hover:border-strong",
        className
      )}
      {...props}
    />
  );
}

const NONE = "__none";

function OptionsEditor({
  categoryId,
  list,
  openRow,
  onOpenRow,
  onEdit,
}: {
  categoryId: number;
  list: AccessoryOptionConfig[];
  openRow: number;
  onOpenRow: (i: number) => void;
  onEdit: (fn: (list: AccessoryOptionConfig[]) => AccessoryOptionConfig[]) => void;
}) {
  const records = useQuery(accessoriesInCategoryQuery(categoryId));
  const products = groupAccessoryProducts(records.data ?? []);
  const productOf = (id: number | null) => (id == null ? null : findProductBySavedId(products, id));
  const set = (i: number, patch: Partial<AccessoryOptionConfig>) => onEdit((l) => l.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <>
      {records.isError && (
        <SnipeDown onRetry={() => void records.refetch()}>
          Couldn&rsquo;t load accessories from Snipe-IT. Labels still edit; primary and backup can&rsquo;t change until it&rsquo;s back.
        </SnipeDown>
      )}
      <Section
        label={`Options · ${list.length}`}
        note={
          <button
            type="button"
            onClick={() => {
              onEdit((l) => [...l, { label: "", displayLabel: null, accessoryLabel: null, primary: null, backup: null }]);
              onOpenRow(list.length);
            }}
            className={btn({ variant: "ghost", size: "sm", className: "-my-1 h-7 pr-2.25 pl-1.5 fs-11 text-tx2" })}
          >
            <Icon name="add" size={15} />
            Add option
          </button>
        }
      >
        <Sheet className="overflow-hidden">
          {list.length === 0 && (
            <div className="px-4 py-3.5 fs-11.5 leading-normal text-tx3">
              No options yet. Requests for this category issue the first in-stock item. Add an option to name the choices.
            </div>
          )}
          {list.map((o, i) => {
            const open = openRow === i;
            const primary = productOf(o.primary);
            const backup = productOf(o.backup);
            return (
              <div key={o.id ?? `new-${i}`} className={cn(i > 0 && "border-t border-line2", open && "bg-subtle")}>
                <div className="flex items-center gap-2 py-1 pr-2.5 pl-3">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => onOpenRow(open ? -1 : i)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent py-1.75 text-left font-sans text-tx outline-none focus-visible:underline"
                  >
                    <Icon name={open ? "expand_more" : "chevron_right"} size={15.5} className="text-mut" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate fs-11.5 font-medium">{o.label || "Untitled option"}</span>
                      <span className="mt-0.5 block truncate fs-10.5 text-mut">
                        {primary ? `${primary.label} · ${primary.aggregateRemaining} in stock` : "No primary picked"}
                      </span>
                    </span>
                  </button>
                  <IconButton
                    icon="delete"
                    label="Remove option"
                    danger
                    onClick={() => {
                      onEdit((l) => l.filter((_, j) => j !== i));
                      onOpenRow(-1);
                    }}
                  />
                </div>
                {open && (
                  <div className="flex flex-col gap-3 pr-3.5 pb-3.5 pl-9.5">
                    <label className="flex flex-col gap-1.25 fs-11 text-tx3">
                      Option label
                      <Input value={o.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="e.g. iPad A16 – Case" className="fs-11.5" />
                      <span className="fs-10.5 text-mut">What requesters see. Name the model and type, since &ldquo;Case&rdquo; alone is ambiguous.</span>
                    </label>
                    <div className="flex items-center gap-2 fs-10.5 text-mut">
                      <Icon name="visibility_off" size={13} />
                      Admin only, shown in the requests table
                      <span className="h-px flex-1 bg-line2" />
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(8.75rem,1fr))] gap-2.5">
                      <label className="flex min-w-0 flex-col gap-1.25 fs-11 text-tx3">
                        Type label
                        <Input value={o.displayLabel ?? ""} onChange={(e) => set(i, { displayLabel: e.target.value })} placeholder="Case" className="fs-11.5" />
                      </label>
                      <label className="flex min-w-0 flex-col gap-1.25 fs-11 text-tx3">
                        Accessory name
                        <Input value={o.accessoryLabel ?? ""} onChange={(e) => set(i, { accessoryLabel: e.target.value })} placeholder="iPad A16" className="fs-11.5" />
                      </label>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(8.75rem,1fr))] gap-2.5">
                      <ProductPick
                        label="Primary"
                        products={products}
                        value={primary?.representativeId ?? null}
                        disabled={records.isError || records.isPending}
                        onChange={(id) => set(i, { primary: id, backup: o.backup === id ? null : o.backup })}
                        hint={o.primary == null ? "Required" : primary ? (primary.aggregateRemaining ? `${primary.aggregateRemaining} in stock across all sites` : "Out of stock at every site") : ""}
                        hintBad={!!primary && !primary.aggregateRemaining}
                      />
                      <ProductPick
                        label="Backup"
                        products={products.filter((x) => x.representativeId !== primary?.representativeId)}
                        value={backup?.representativeId ?? null}
                        disabled={records.isError || records.isPending}
                        onChange={(id) => set(i, { backup: id })}
                        allowNone
                        hint={backup ? `${backup.aggregateRemaining} in stock across all sites` : "Optional"}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex items-center gap-2 border-t border-line2 bg-subtle px-3 py-2.75 fs-11.5 text-mut">
            <Icon name="lock" size={15} />
            <span className="flex-1">Something else</span>
            <span className="fs-10.5">Always offered</span>
          </div>
        </Sheet>
      </Section>
      <p className="m-0 px-1.5 fs-10.5 leading-normal text-pretty text-mut">
        Stock counts are summed across all sites. Requests take the primary, preferring stock at the requester&rsquo;s site, then the backup. If
        both are out of stock the request can&rsquo;t be filled.
      </p>
    </>
  );
}

function ProductPick({
  label,
  products,
  value,
  onChange,
  disabled,
  allowNone,
  hint,
  hintBad,
}: {
  label: string;
  products: ReturnType<typeof groupAccessoryProducts>;
  value: number | null;
  onChange: (id: number | null) => void;
  disabled?: boolean;
  allowNone?: boolean;
  hint: string;
  hintBad?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.25 fs-11 text-tx3">
      {label}
      <Select value={value == null ? (allowNone ? NONE : undefined) : String(value)} onValueChange={(v) => onChange(v === NONE ? null : Number(v))} disabled={disabled}>
        <SelectTrigger aria-label={label} className="w-full min-w-0 fs-11.5">
          <SelectValue placeholder="Pick an accessory" />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE}>(none)</SelectItem>}
          {products.map((p) => (
            <SelectItem key={p.key} value={String(p.representativeId)}>
              {p.label} — {p.aggregateRemaining} in stock
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className={cn("fs-10.5", hintBad ? "text-stop" : "text-mut")}>{hint}</span>
    </label>
  );
}
