import { useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ROW_IN, rowIn } from "@/lib/motion";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  allAssetCategoriesQuery,
  categoryModelsQuery,
  requestableAssetIdsQuery,
  skeletonStatusQuery,
  standardModelsQuery,
  statusesQuery,
} from "@/api/queries";
import { setRequestableCategoryIds, setSkeletonStatusId, setStandardModelsForCategory } from "@/api/settings";
import { mobileFilterQuery, saveMobileFilterConfig } from "@/hooks/useMobileFilterConfig";
import type { CategoryModel } from "@/types/categoriesType";
import type { CategoryStandardModels } from "@/types/settingsType";
import { Aside, ChipToggle, Hint, HowThisWorks, Row, SaveNote, Section, Sheet, SnipeDown } from "../parts";
import { Panel } from "../SettingsPanel";
import { draftChip, useSave } from "../saveStatus";

///  +-----------------------------------------------------------------+
///  |                  ASSETS                                         |
///  +-----------------------------------------------------------------+
//
//  What people can request, and which models a standard request uses.
//
//  EMPTY MEANS NOTHING. The requestable list for assets is a whitelist with
//  no "everything" fallback, the opposite of accessories, so it says so at
//  the control and in red when it's empty.
//
//  A MODEL ONLY WORKS AS A STANDARD if it has an asset free to hand out with
//  a Tier value. Each row says whether its primary does, from the backend's
//  cached hardware list, so a dead standard shows here before a request
//  quietly turns non-standard.
///  +-----------------------------------------------------------------+

/** What a model can do for a standard request, in a phrase. */
function modelState(m: CategoryModel | undefined): { works: boolean; text: string } | null {
  if (!m || m.available === undefined) return null;
  const tier = m.availableWithTier ?? 0;
  if (tier > 0) return { works: true, text: `${tier} available · Tier set` };
  if (m.available > 0) return { works: false, text: `${m.available} available, none with a Tier value` };
  return { works: false, text: "None available" };
}

export function Assets() {
  const client = useQueryClient();
  const { save } = useSave();
  const cats = useQuery(allAssetCategoriesQuery);
  const req = useQuery(requestableAssetIdsQuery);
  const std = useQuery(standardModelsQuery);
  const [retrying, setRetrying] = useState(false);

  const ids = req.data ?? [];
  const all = cats.data ?? [];
  const requestable = all.filter((c) => ids.includes(c.id));
  const nameOf = (id: number) => all.find((c) => c.id === id)?.name ?? `Category ${id}`;

  const models = useQueries({ queries: requestable.map((c) => categoryModelsQuery(c.id)) });
  const modelsOf = (catId: number) => models[requestable.findIndex((c) => c.id === catId)]?.data ?? [];

  const toggle = (id: number) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    client.setQueryData(requestableAssetIdsQuery.queryKey, next);
    void save("assetReq", async () => {
      try {
        client.setQueryData(requestableAssetIdsQuery.queryKey, await setRequestableCategoryIds(next));
      } catch (err) {
        client.setQueryData(requestableAssetIdsQuery.queryKey, ids);
        throw err;
      }
    });
  };

  const retry = () => {
    setRetrying(true);
    void Promise.all([cats.refetch(), ...models.map((m) => m.refetch())]).finally(() => setRetrying(false));
  };

  // ── The standard models panel ────────────────────────────────────────
  const [open, setOpen] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, CategoryStandardModels>>({});
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  const saved = (id: number): CategoryStandardModels => std.data?.[String(id)] ?? { primary: null, backup: null };
  const current = (id: number) => drafts[id] ?? saved(id);
  const dirtyIds = Object.keys(drafts)
    .map(Number)
    .filter((id) => JSON.stringify(drafts[id]) !== JSON.stringify(saved(id)));

  const setPick = (id: number, key: "primary" | "backup", model: number | null) => {
    setState("idle");
    setDrafts((d) => {
      const base = d[id] ?? saved(id);
      const next = { ...base, [key]: model };
      // A model can't be its own backup.
      if (key === "primary" && next.backup === model) next.backup = null;
      return { ...d, [id]: next };
    });
  };

  async function saveDrafts() {
    setState("saving");
    try {
      for (const id of dirtyIds) {
        const d = drafts[id];
        client.setQueryData(standardModelsQuery.queryKey, await setStandardModelsForCategory(id, d.primary, d.backup));
      }
      setDrafts({});
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  const down = cats.isError;
  const openModels = open != null ? modelsOf(open) : [];
  const openPick = open != null ? current(open) : null;

  return (
    <>
      {down && (
        <SnipeDown onRetry={retry} retrying={retrying}>
          <b className="font-semibold">Can&rsquo;t reach Snipe-IT.</b> Lists that come from it can&rsquo;t load. Settings stored in Checkout still save.
        </SnipeDown>
      )}

      <Section label="Requestable" note="Saves as you go">
        <Sheet className="flex flex-col gap-3 px-4 py-3.5">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-[1_1_16.25rem]">
              <div className="fs-11.5 font-medium">Asset categories people can request</div>
              <div className="mt-0.75 fs-11 leading-[1.45] text-mut">Picked from Snipe-IT categories.</div>
            </div>
            <Hint tone="prog" icon="block">
              Empty means nothing is requestable
            </Hint>
          </div>
          {!down ? (
            <div className="flex flex-wrap gap-1.5">
              {all.map((c) => (
                <ChipToggle key={c.id} on={ids.includes(c.id)} onClick={() => toggle(c.id)}>
                  {c.name}
                </ChipToggle>
              ))}
              {cats.isPending && <span className="fs-11 text-mut">Loading categories…</span>}
            </div>
          ) : (
            <SnipeDown onRetry={retry} retrying={retrying}>
              Couldn&rsquo;t load categories. {ids.length ? `${ids.length} saved as requestable.` : "Nothing is saved as requestable."}
            </SnipeDown>
          )}
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1.5 fs-10.5">
            <span className={ids.length ? "text-mut" : "font-medium text-stop"}>
              {ids.length ? `${ids.length} of ${all.length || ids.length} requestable` : "Nothing is requestable. The asset form is empty for everyone."}
            </span>
            <SaveNote k="assetReq" />
          </div>
        </Sheet>
      </Section>

      <Section label="Standard models" note="Opens on the right · Save when done">
        <Sheet className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3 fs-11 text-tx3">
            <span>Standard requests take the primary model first, then the backup.</span>
            <HowThisWorks>
              <Aside className="mt-0.5 w-full">
                A model only works as a standard if it has an available asset with a Tier value. If the primary has none, the backup is used. If
                neither does, the request becomes non-standard.
              </Aside>
            </HowThisWorks>
          </div>
          <div className="hidden h-8 grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)_1.25rem] items-center gap-x-3.5 border-y border-line2 bg-subtle pr-3.5 pl-4 fs-10.5 text-mut desk:grid">
            <span>Category</span>
            <span>Primary</span>
            <span>Backup</span>
            <span />
          </div>
          {requestable.length === 0 && (
            <p className="m-0 border-t border-line2 px-4 py-3.5 fs-11.5 text-mut desk:border-t-0">Make a category requestable above to pick its standard models.</p>
          )}
          {requestable.map((c, i) => {
            const v = current(c.id);
            const ms = modelsOf(c.id);
            const p = ms.find((m) => m.id === v.primary);
            const b = ms.find((m) => m.id === v.backup);
            const ps = modelState(p);
            const bs = modelState(b);
            const pBad = v.primary != null && ps != null && !ps.works;
            const sel = open === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setOpen(c.id)}
                style={rowIn(i)}
                className={cn(
                  "grid min-h-13.5 w-full cursor-pointer grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.25rem] items-center gap-x-3.5 gap-y-1 border-0 border-t border-line2 bg-transparent py-2 pr-3.5 pl-4 text-left font-sans text-tx outline-none [grid-template-areas:'cat_cat_chev'_'p_b_chev'] hover:bg-subtle focus-visible:bg-subtle desk:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)_1.25rem] desk:[grid-template-areas:'cat_p_b_chev']",
                  ROW_IN,
                  sel && "bg-brand-sub shadow-[inset_3px_0_0_var(--brand)] hover:bg-brand-sub"
                )}
              >
                <span className="fs-11.5 font-medium [grid-area:cat]">{c.name}</span>
                <span className="min-w-0 [grid-area:p]">
                  <span className="block truncate fs-11.5">{p?.name ?? (v.primary != null ? `Model ${v.primary}` : "Not set")}</span>
                  <span className={cn("mt-0.5 flex items-center gap-1 fs-10.5", pBad || v.primary == null ? "text-stop" : "text-mut")}>
                    {pBad && <Icon name="error" size={12} />}
                    <span className="truncate">
                      {v.primary == null
                        ? "Standard requests become non-standard"
                        : pBad
                          ? `No asset with a Tier value${v.backup != null ? ", so the backup is used" : ""}`
                          : ps?.text.replace(" · Tier set", "") ?? ""}
                    </span>
                  </span>
                </span>
                <span className="min-w-0 [grid-area:b]">
                  <span className={cn("block truncate fs-11.5", v.backup == null && "text-mut")}>{b?.name ?? (v.backup != null ? `Model ${v.backup}` : "No backup")}</span>
                  <span className="mt-0.5 block truncate fs-10.5 text-mut">
                    {dirtyIds.includes(c.id) ? "Unsaved" : v.backup != null && bs ? (bs.works ? bs.text.replace(" · Tier set", "") : "No asset with a Tier value") : ""}
                  </span>
                </span>
                <Icon name="chevron_right" size={15.5} className="text-mut [grid-area:chev]" />
              </button>
            );
          })}
        </Sheet>
      </Section>

      <Section label="Placeholders and phones" note="Saves as you go">
        <Sheet>
          <SkeletonStatus />
          <div className="border-t border-line2">
            <MobileNumbers />
          </div>
        </Sheet>
      </Section>

      {open != null && openPick && (
        <Panel
          open
          onClose={() => setOpen(null)}
          backLabel="Assets"
          kicker="Standard models"
          title={nameOf(open)}
          chip={draftChip(state, dirtyIds.includes(open))}
          notices={
            <>
              {state === "failed" && (
                <SnipeDown onRetry={() => void saveDrafts()}>Couldn&rsquo;t save. Your picks are still here; try Save changes again.</SnipeDown>
              )}
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
          <ModelPicks
            label="Primary"
            note="Tried first"
            models={openModels}
            value={openPick.primary}
            onPick={(id) => setPick(open, "primary", id)}
          />
          <ModelPicks
            label="Backup"
            note="Optional"
            models={openModels}
            value={openPick.backup}
            disabledId={openPick.primary}
            onPick={(id) => setPick(open, "backup", id)}
            none="Standard requests stop at the primary"
          />
        </Panel>
      )}
    </>
  );
}

function ModelPicks({
  label,
  note,
  models,
  value,
  onPick,
  disabledId,
  none,
}: {
  label: string;
  note: string;
  models: CategoryModel[];
  value: number | null;
  onPick: (id: number | null) => void;
  disabledId?: number | null;
  /** Offer "No backup", described like this. */
  none?: string;
}) {
  const rows: { id: number | null; name: string; sub: string; bad: boolean; disabled: boolean }[] = models.map((m) => {
    const s = modelState(m);
    return { id: m.id, name: m.name, sub: s?.text ?? "", bad: !!s && !s.works, disabled: m.id === disabledId };
  });
  if (none) rows.push({ id: null, name: "No backup", sub: none, bad: false, disabled: false });
  return (
    <Section label={label} note={note}>
      <Sheet role="radiogroup" aria-label={label} className="overflow-hidden">
        {rows.length === 0 && <p className="m-0 px-3.5 py-3 fs-11.5 text-mut">No models in this category yet.</p>}
        {rows.map((r, i) => {
          const on = value === r.id;
          return (
            <button
              key={r.id ?? "none"}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={r.disabled}
              onClick={() => onPick(r.id)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-3.5 py-2.75 text-left font-sans text-tx outline-none hover:bg-subtle focus-visible:bg-subtle disabled:cursor-default disabled:opacity-55 disabled:hover:bg-transparent",
                i > 0 && "border-t border-line2"
              )}
            >
              <span className={cn("size-4 flex-none rounded-full bg-sheet", on ? "border-[5px] border-brand" : "border-[1.5px] border-strong")} />
              <span className="min-w-0 flex-1">
                <span className="block fs-11.5 font-medium">{r.name}</span>
                {r.sub && <span className={cn("mt-0.5 block fs-10.5", r.bad ? "text-stop" : "text-mut")}>{r.sub}</span>}
              </span>
            </button>
          );
        })}
      </Sheet>
    </Section>
  );
}

const BLANK = "__blank";

function SkeletonStatus() {
  const client = useQueryClient();
  const { save } = useSave();
  const statuses = useQuery(statusesQuery);
  const value = useQuery(skeletonStatusQuery);
  const current = value.data ?? null;

  const pick = (v: string) => {
    const next = v === BLANK ? null : Number(v);
    client.setQueryData(skeletonStatusQuery.queryKey, next);
    void save("skel", async () => {
      try {
        client.setQueryData(skeletonStatusQuery.queryKey, await setSkeletonStatusId(next));
      } catch (err) {
        client.setQueryData(skeletonStatusQuery.queryKey, current);
        throw err;
      }
    });
  };

  const savedName = statuses.data?.find((s) => s.id === current)?.name;
  return (
    <Row title="Skeleton asset status" desc="Given to placeholder assets made for non-standard requests. Left blank, it falls back to a status named “Pending”.">
      {statuses.isError ? (
        <span className="flex items-center gap-1.5 fs-11 text-stop">
          <Icon name="sync_problem" size={14} />
          Statuses didn&rsquo;t load · saved: {current ?? "blank"}
        </span>
      ) : (
        <Select value={current == null ? BLANK : String(current)} onValueChange={pick}>
          <SelectTrigger aria-label="Skeleton asset status" className="w-full fs-11.5">
            <SelectValue placeholder={savedName ?? "Loading…"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={BLANK}>(blank: uses “Pending”)</SelectItem>
            {(statuses.data ?? []).map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <SaveNote k="skel" />
    </Row>
  );
}

function MobileNumbers() {
  const { save } = useSave();
  const config = useQuery(mobileFilterQuery);
  const [edit, setEdit] = useState<{ countryCode: string; mobileLeadingDigit: string } | null>(null);
  const v = edit ?? config.data ?? { countryCode: "61", mobileLeadingDigit: "4" };

  const commit = () => {
    if (!edit || !config.data) return;
    if (edit.countryCode === config.data.countryCode && edit.mobileLeadingDigit === config.data.mobileLeadingDigit) return setEdit(null);
    if (!edit.countryCode || !edit.mobileLeadingDigit) return setEdit(null);
    void save("phone", async () => {
      await saveMobileFilterConfig(edit);
      setEdit(null);
    });
  };

  return (
    <Row title="Mobile number recognition" desc="Decides which Snipe-IT numbers count as mobiles in the “reuse an existing number” picker.">
      <div className="flex w-full gap-2">
        <label className="flex flex-1 flex-col gap-1 fs-10.5 text-tx3">
          Country code
          <span className="flex h-9 items-center rounded-8 border border-strong bg-sheet pl-2.5 font-mono fs-11.5 text-mut focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--brand-sub)]">
            +
            <input
              value={v.countryCode}
              inputMode="numeric"
              onChange={(e) => setEdit({ ...v, countryCode: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              onBlur={commit}
              className="h-full min-w-0 flex-1 border-0 bg-transparent pr-2 pl-0.5 font-mono fs-11.5 text-tx outline-none"
            />
          </span>
        </label>
        <label className="flex flex-1 flex-col gap-1 fs-10.5 whitespace-nowrap text-tx3">
          Leading digit
          <Input
            value={v.mobileLeadingDigit}
            inputMode="numeric"
            onChange={(e) => setEdit({ ...v, mobileLeadingDigit: e.target.value.replace(/\D/g, "").slice(0, 1) })}
            onBlur={commit}
            className="font-mono fs-11.5"
          />
        </label>
      </div>
      <span className="fs-10.5 text-mut">
        Counts <span className="font-mono">+{v.countryCode} {v.mobileLeadingDigit}…</span> as a mobile
      </span>
      <SaveNote k="phone" />
    </Row>
  );
}
