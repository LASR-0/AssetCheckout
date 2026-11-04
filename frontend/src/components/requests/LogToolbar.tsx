import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { SegmentedControl } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAGE_META } from "@/lib/route";
import CountBadge from "@/components/ui/countbadge";
import { ANY, VIEWS, type View } from "./useRequestLog";

type Props = {
  view: View;
  onView: (v: View) => void;
  needsCount: number;
  site: string;
  onSite: (s: string) => void;
  sites: { id: number; name: string }[];
  stage: string;
  onStage: (s: string) => void;
  q: string;
  onQ: (q: string) => void;
};

const FILTER = "h-8 w-auto gap-1.5 rounded-8 border-strong pr-2 pl-2.75 fs-13 text-tx2 max-desk:h-11";

/** Views, the two filters and the search. `/` jumps to the search. */
export function LogToolbar({ view, onView, needsCount, site, onSite, sites, stage, onStage, q, onQ }: Props) {
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div data-tour="requests-views" className="flex max-w-full">
      <SegmentedControl<View>
        label="View"
        value={view}
        onValueChange={onView}
        options={VIEWS.map((v) => ({
          value: v.key,
          label:
            v.key === "needs" && needsCount > 0 ? (
              <>
                {v.label}
                <CountBadge count={needsCount} label="need you" />
              </>
            ) : (
              v.label
            ),
        }))}
        className="max-w-full overflow-x-auto overflow-y-hidden *:h-6.5 *:font-normal *:data-[state=on]:font-medium max-desk:*:h-9"
      />
      </div>

      {sites.length > 1 && (
        <Select value={site} onValueChange={onSite}>
          <SelectTrigger aria-label="Site" className={FILTER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All sites</SelectItem>
            <SelectSeparator />
            {sites.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={stage} onValueChange={onStage}>
        <SelectTrigger aria-label="Stage" data-tour="requests-filter" className={FILTER}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any stage</SelectItem>
          <SelectSeparator />
          {Object.entries(STAGE_META).map(([key, m]) => (
            <SelectItem key={key} value={key}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label
        data-tour="requests-search"
        className={cn(
          "ml-auto flex h-8 w-65 items-center gap-2 rounded-9 border border-strong bg-sheet pr-2 pl-2.5 fs-13 text-placeholder transition-colors focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--brand-sub)] hover:border-mut",
          "max-desk:h-11 max-desk:w-full"
        )}
      >
        <Icon name="search" size={18} weight={300} />
        <input
          ref={search}
          value={q}
          onChange={(e) => onQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onQ("");
              e.currentTarget.blur();
            }
          }}
          placeholder="Search people, items, IDs"
          aria-label="Search requests"
          className="min-w-0 flex-1 border-0 bg-transparent font-sans text-tx outline-none placeholder:text-placeholder"
        />
        <kbd className="hidden rounded-5 border border-line px-1.5 font-mono fs-11 desk:inline">/</kbd>
      </label>
    </div>
  );
}
