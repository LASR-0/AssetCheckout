import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ROW_IN, rowIn } from "@/lib/motion";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { btn } from "@/components/ui/variants";
import { locationsQuery, siteColoursQuery, stockKeepersFullQuery, stockKeepersQuery, usersQuery } from "@/api/queries";
import { setSiteColour, setStockKeepersForLocation } from "@/api/settings";
import type { StockKeeperEntry, StockKeepersConfig } from "@/types/settingsType";
import { ChipToggle, SaveNote, Section, Sheet, SnipeDown } from "../parts";
import { useSave } from "../saveStatus";

///  +-----------------------------------------------------------------+
///  |                  SITES & STOCK KEEPERS                          |
///  +-----------------------------------------------------------------+
//
//  Who hands out hardware at each site, as a table: sites down the side,
//  people across the top, a tick where someone keeps a site. Each site
//  takes up to the server's cap, and a full site's empty cells are dashed
//  and won't take another.
//
//  AN EMPTY SITE ISN'T BROKEN. Admins can stand in anywhere, so it says
//  "falls to IT" rather than looking unfinished.
//
//  Then each site's colour: the edge down a request row and the dot beside
//  the site's name, from a fixed set that reads in light and dark.
///  +-----------------------------------------------------------------+

const SWATCHES = [
  ["Teal", "#3f8a8c"],
  ["Ochre", "#a8843a"],
  ["Violet", "#8b6bb8"],
  ["Slate blue", "#5b7ba8"],
  ["Moss", "#6e8a52"],
  ["Clay", "#b0645a"],
  ["Rose", "#b05e86"],
  ["Stone", "#8a8178"],
] as const;

type Person = { userId: number; name: string; email: string | null };

export function Sites() {
  const client = useQueryClient();
  const { save } = useSave();
  const locations = useQuery(locationsQuery);
  const keepersQ = useQuery(stockKeepersFullQuery);
  const users = useQuery(usersQuery);
  const colours = useQuery(siteColoursQuery);
  const [added, setAdded] = useState<Person[]>([]);
  const [removed, setRemoved] = useState<number[]>([]);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const config: StockKeepersConfig = keepersQ.data?.config ?? {};
  const cap = keepersQ.data?.maxPerLocation ?? 3;
  const sites = locations.data ?? [];
  const keepersAt = (id: number) => config[String(id)]?.keepers ?? [];

  // Columns: everyone keeping a site, then anyone added here and not yet ticked.
  const people: Person[] = [];
  for (const entry of Object.values(config)) for (const k of entry.keepers) if (!people.some((p) => p.userId === k.userId)) people.push(k);
  for (const p of added) if (!people.some((x) => x.userId === p.userId)) people.push(p);
  const cols = people.filter((p) => !removed.includes(p.userId));

  const setSite = (siteId: number, siteName: string, next: StockKeeperEntry[]) => {
    const before = keepersQ.data;
    client.setQueryData(stockKeepersFullQuery.queryKey, (d: typeof before) =>
      d ? { ...d, config: { ...d.config, [String(siteId)]: { locationName: siteName, keepers: next } } } : d
    );
    return save("keep", async () => {
      try {
        const saved = await setStockKeepersForLocation(siteId, next, siteName);
        client.setQueryData(stockKeepersFullQuery.queryKey, saved);
        // Stock's site picker reads the plain map.
        client.setQueryData(stockKeepersQuery.queryKey, saved.config);
      } catch (err) {
        client.setQueryData(stockKeepersFullQuery.queryKey, before);
        throw err;
      }
    });
  };

  const toggle = (siteId: number, siteName: string, p: Person) => {
    const list = keepersAt(siteId);
    const on = list.some((k) => k.userId === p.userId);
    void setSite(siteId, siteName, on ? list.filter((k) => k.userId !== p.userId) : [...list, { userId: p.userId, name: p.name, email: p.email }]);
  };

  const removeColumn = (p: Person) => {
    setRemoved((r) => [...r, p.userId]);
    setAdded((a) => a.filter((x) => x.userId !== p.userId));
    for (const s of sites) {
      const list = keepersAt(s.id);
      if (list.some((k) => k.userId === p.userId)) void setSite(s.id, s.name, list.filter((k) => k.userId !== p.userId));
    }
  };

  const needle = q.trim().toLowerCase();
  const results = (users.data ?? [])
    .filter((u) => !cols.some((c) => String(c.userId) === u.id) && (!needle || u.name.toLowerCase().includes(needle)))
    .slice(0, 8);
  const pick = (u: { id: string; name: string; email: string | null }) => {
    const p = { userId: Number(u.id), name: u.name, email: u.email };
    setAdded((a) => [...a, p]);
    setRemoved((r) => r.filter((x) => x !== p.userId));
    setAdding(false);
    setQ("");
  };

  const sitesOf = (p: Person) => sites.filter((s) => keepersAt(s.id).some((k) => k.userId === p.userId)).length;
  const noEmail = cols.filter((p) => !p.email);
  const grid = { gridTemplateColumns: `minmax(12.5rem,1.3fr) repeat(${cols.length}, minmax(7.75rem,1fr)) 5.625rem 8.75rem` };

  const addPerson = (
    <Popover open={adding} onOpenChange={setAdding}>
      <PopoverTrigger asChild>
        <button type="button" className={btn({ size: "sm", className: "h-7.5 rounded-8 pr-2.5 pl-1.5 fs-11 max-desk:h-11 max-desk:w-full max-desk:rounded-10 max-desk:fs-12" })}>
          <Icon name="person_add" size={15} />
          Add person
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-70 gap-1 p-1.5">
        <label className="flex h-8.5 items-center gap-2 rounded-8 border border-strong px-2 text-mut focus-within:border-brand">
          <Icon name="search" size={15} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people…"
            aria-label="Search people"
            className="min-w-0 flex-1 border-0 bg-transparent font-sans fs-11.5 text-tx outline-none"
          />
        </label>
        {users.isError ? (
          <div className="flex items-center gap-2 p-2 fs-11 text-tx3">
            <Icon name="sync_problem" size={14} className="text-stop" />
            People search needs Snipe-IT.
          </div>
        ) : (
          results.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => pick(u)}
              className="flex w-full cursor-pointer flex-col rounded-7 border-0 bg-transparent p-2 text-left font-sans fs-11.5 text-tx outline-none hover:bg-hover focus-visible:bg-hover"
            >
              <span className="font-medium">{u.name}</span>
              <span className="fs-10.5 text-mut">{u.email || "No email on record"}</span>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );

  return (
    <>
      {locations.isError && (
        <SnipeDown onRetry={() => void locations.refetch()}>
          <b className="font-semibold">Can&rsquo;t reach Snipe-IT.</b> Sites come from its locations, so they can&rsquo;t load.
        </SnipeDown>
      )}

      <Section label="Stock keepers" note="Saves as you go">
        <Sheet>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 fs-11 leading-[1.45] text-tx3">
            <span className="flex-[1_1_20rem] text-pretty">
              Stock keepers confirm handovers at their site. Each site takes up to {cap} people. Tick a cell to add or remove someone.
            </span>
            <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
              <span className="inline-flex items-center gap-1.25 fs-10.5">
                <Icon name="shield_person" size={14} className="text-mut" />
                Admins can stand in at any site
              </span>
              <SaveNote k="keep" />
            </span>
          </div>

          {/* The table, from desk up. */}
          <div className="hidden overflow-x-auto border-t border-line2 desk:block">
            <div className="min-w-max">
              <div className="grid min-h-13 items-center gap-x-2 bg-subtle px-4 py-2" style={grid}>
                <span className="flex items-center gap-1.25 fs-10.5 text-mut">
                  <Icon name="location_on" size={13} />
                  Site
                </span>
                {cols.map((p) => (
                  <div key={p.userId} className="flex min-w-0 flex-col items-center gap-0.75 text-center">
                    <span className="inline-flex items-center gap-0.5">
                      <span className="fs-11.5 font-medium whitespace-nowrap">{p.name}</span>
                      <button
                        type="button"
                        onClick={() => removeColumn(p)}
                        title="Remove from table"
                        aria-label={`Remove ${p.name}`}
                        className="grid size-5.5 cursor-pointer place-items-center rounded-6 border-0 bg-transparent p-0 text-mut hover:bg-hover hover:text-stop"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </span>
                    {p.email ? (
                      <span className="fs-10.5 text-mut">{sitesOf(p) ? `${sitesOf(p)} site${sitesOf(p) > 1 ? "s" : ""}` : "No sites yet"}</span>
                    ) : (
                      <span title="Can't be notified" className="inline-flex items-center gap-1 fs-10.5 text-stop">
                        <Icon name="mail_off" size={12} />
                        No email
                        <button type="button" onClick={() => removeColumn(p)} className="cursor-pointer border-0 bg-transparent p-0 pl-0.5 font-sans fs-10.5 font-medium text-stop underline">
                          Remove
                        </button>
                      </span>
                    )}
                  </div>
                ))}
                <span className="text-center fs-10.5 text-mut">Keepers</span>
                <div className="flex justify-end">{addPerson}</div>
              </div>
              {sites.map((s, i) => {
                const list = keepersAt(s.id);
                const full = list.length >= cap;
                return (
                  <div key={s.id} style={{ ...grid, ...rowIn(i) }} className={cn("grid min-h-13 items-center gap-x-2 border-t border-line2 px-4 py-2", ROW_IN)}>
                    <div className="min-w-0">
                      <SitePill name={s.name} />
                      {!list.length && (
                        <div className="mt-1.25 flex items-center gap-1 fs-10.5 text-prog">
                          <Icon name="support_agent" size={12} />
                          <span className="text-tx3">Empty, so it falls to IT</span>
                        </div>
                      )}
                    </div>
                    {cols.map((p) => {
                      const on = list.some((k) => k.userId === p.userId);
                      const dis = !on && full;
                      const warn = on && !p.email;
                      return (
                        <div key={p.userId} className="grid place-items-center">
                          <button
                            type="button"
                            disabled={dis}
                            onClick={() => toggle(s.id, s.name, p)}
                            aria-pressed={on}
                            title={dis ? `${s.name} is at its cap of ${cap}` : on ? `Remove ${p.name} from ${s.name}` : `Make ${p.name} a keeper at ${s.name}`}
                            className={cn(
                              "grid size-7 cursor-pointer place-items-center rounded-8 border transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed",
                              on ? (warn ? "border-stop-line bg-stop-bg text-stop" : "border-brand bg-brand text-on-brand") : dis ? "border-dashed border-line bg-sheet" : "border-strong bg-sheet hover:bg-hover"
                            )}
                          >
                            {on && <Icon name={warn ? "mail_off" : "check"} size={15} />}
                          </button>
                        </div>
                      );
                    })}
                    <span className={cn("text-center fs-11", full ? "font-medium text-tx" : "text-mut")}>
                      {list.length} / {cap}
                    </span>
                    <span />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Below desk: chips per site. */}
          <div className="flex flex-col gap-2 px-4 pb-3 desk:hidden">
            {noEmail.map((p) => (
              <div key={p.userId} className="flex items-center gap-2 rounded-9 bg-stop-bg px-2.5 py-2.25 fs-11.5 shadow-[inset_0_0_0_1px_var(--stop-line)]">
                <Icon name="mail_off" size={15} className="text-stop" />
                <span className="min-w-0 flex-1">{p.name} has no email, so can&rsquo;t be notified.</span>
                <button type="button" onClick={() => removeColumn(p)} className={btn({ variant: "danger", size: "md", className: "fs-11.5" })}>
                  Remove
                </button>
              </div>
            ))}
            {addPerson}
          </div>
          {sites.map((s) => {
            const list = keepersAt(s.id);
            const full = list.length >= cap;
            return (
              <div key={s.id} className="flex flex-col gap-2 border-t border-line2 px-4 py-3 desk:hidden">
                <div className="flex items-center justify-between gap-2">
                  <span className="fs-12 font-medium">{s.name}</span>
                  <span className={cn("fs-11", full ? "font-medium text-tx" : "text-mut")}>
                    {list.length} / {cap}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cols.map((p) => {
                    const on = list.some((k) => k.userId === p.userId);
                    return (
                      <ChipToggle key={p.userId} on={on} disabled={!on && full} onClick={() => toggle(s.id, s.name, p)} className="h-9 fs-11.5">
                        {on && !p.email ? `${p.name} · no email` : p.name}
                      </ChipToggle>
                    );
                  })}
                </div>
                {!list.length && <div className="fs-11 text-tx3">Empty, so it falls to IT.</div>}
              </div>
            );
          })}
          <div className="rounded-b-11 border-t border-line2 bg-subtle px-4 py-2.75 fs-10.5 text-pretty text-mut">
            Sites are Snipe-IT locations. The cap of {cap} comes from the server. A person with no email on record can&rsquo;t be notified, so remove
            them or add an email in Snipe-IT.
          </div>
        </Sheet>
      </Section>

      <Section label="Site colours" note={<SaveNote k="col" />}>
        <Sheet>
          <div className="px-4 py-3 fs-11 leading-[1.45] text-pretty text-tx3">
            Each site&rsquo;s colour is used for the edge down the left of a request row and the dot beside the site name. Pick from the fixed set so
            colours stay readable in light and dark.
          </div>
          {sites.map((s) => {
            const colour = colours.data?.[String(s.id)] ?? null;
            const set = (hex: string | null) =>
              void save("col", async () => {
                await setSiteColour(s.id, hex);
              });
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-line2 px-4 py-3">
                <div className="relative flex h-10 min-w-0 flex-[1_1_13.75rem] items-center gap-2 overflow-hidden rounded-9 border border-line bg-sheet pr-3 pl-3.5">
                  <span aria-hidden className={cn("absolute inset-y-0 left-0 w-0.75", !colour && "bg-line")} style={colour ? { background: colour } : undefined} />
                  <span className="fs-11.5 font-medium whitespace-nowrap">{s.name}</span>
                  <SitePill name={s.name} colour={colour} small />
                </div>
                <div role="radiogroup" aria-label={`Colour for ${s.name}`} className="flex flex-wrap gap-1">
                  {SWATCHES.map(([name, hex]) => (
                    <Swatch key={hex} label={`${name} for ${s.name}`} on={colour === hex} onClick={() => set(hex)} fill={hex} />
                  ))}
                  <Swatch label={`No colour for ${s.name}`} on={colour == null} onClick={() => set(null)} />
                </div>
              </div>
            );
          })}
        </Sheet>
      </Section>
    </>
  );
}

function SitePill({ name, colour, small }: { name: string; colour?: string | null; small?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill border border-line bg-sheet text-tx2 whitespace-nowrap",
        small ? "h-5 gap-1.25 px-1.75 fs-10.5" : "h-6 gap-1 pr-2.25 pl-1.75 fs-11"
      )}
    >
      {small ? (
        <span className={cn("size-1.5 rounded-full", colour == null && "border border-strong")} style={colour ? { background: colour } : undefined} />
      ) : (
        <Icon name="location_on" size={12} weight={300} />
      )}
      {name}
    </span>
  );
}

function Swatch({ label, on, onClick, fill }: { label: string; on: boolean; onClick: () => void; fill?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid size-6.5 cursor-pointer place-items-center rounded-full border-2 bg-transparent p-0 outline-none focus-visible:outline-2 focus-visible:outline-brand max-desk:size-9",
        on ? "border-tx" : "border-transparent"
      )}
    >
      {fill ? (
        <span className="size-4 rounded-full max-desk:size-6.5" style={{ background: fill }} />
      ) : (
        <span className="grid size-4 place-items-center rounded-full border-[1.5px] border-dashed border-strong text-mut max-desk:size-6.5">
          <Icon name="block" size={10} />
        </span>
      )}
    </button>
  );
}

