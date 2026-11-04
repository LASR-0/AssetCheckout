import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ROW_IN, rowIn } from "@/lib/motion";
import { Icon } from "@/components/ui/icon";
import { Tray, TrayLabel, Sheet } from "@/components/ui/tray";
import { btn } from "@/components/ui/variants";
import { iconForGlyph, iconForSubjectKey } from "@/lib/categoryIcon";
import { FROM_SYMPTOM_LIST, troubleshootingArticlePath } from "@/lib/troubleshootingRoutes";
import { shortLabel, type LibraryRow, type LibrarySubject } from "./useLibrary";
import type { SymptomCategoryListing } from "@/types/troubleshootingType";


///  +-----------------------------------------------------------------+
///  |                  THE FRONT PAGE, PIECE BY PIECE                 |
///  +-----------------------------------------------------------------+
//
//  "What's going wrong?" first, as a search across every device and app,
//  because most people know the problem before they know which list it is
//  filed under. Browsing by subject is the second way in, below it.
//
//  Every link into an article carries FROM_SYMPTOM_LIST, so the article's
//  back button returns here as it was left (search and scroll) rather than
//  pushing a fresh copy of this page.
///  +-----------------------------------------------------------------+

const FROM_LIST = { [FROM_SYMPTOM_LIST]: true };

/** "View steps", or a quieter "Not written yet" for a gap. */
function Cta({ written }: { written: boolean }) {
  return (
    <span className={cn("flex-none fs-11.5 whitespace-nowrap", written ? "font-medium text-brand-tx" : "text-mut")}>
      {written ? "View steps" : "Not written yet"}
    </span>
  );
}

const ROW =
  "flex w-full items-center gap-3.5 border-t border-line2 text-left no-underline outline-none first:border-t-0 hover:bg-subtle focus-visible:bg-subtle focus-visible:shadow-[inset_0_0_0_2px_var(--brand)]";

/// ── Hero ─────────────────────────────────────────────────────────────

type HeroProps = {
  query: string;
  onQuery: (q: string) => void;
  popular: LibraryRow[];
  support: ReactNode;
};

export function Hero({ query, onQuery, popular, support }: HeroProps) {
  return (
    <div className="grid grid-cols-1 items-end gap-x-14 gap-y-6 desk:grid-cols-[minmax(0,1fr)_16.25rem]">
      <div className="flex min-w-0 flex-col gap-3.5">
        <TrayLabel>Troubleshooting</TrayLabel>
        <h1 className="m-0 font-head fs-27 leading-[1.1] font-medium tracking-[-0.025em] desk:fs-36">What&rsquo;s going wrong?</h1>
        <p className="m-0 max-w-[56ch] fs-13.5 leading-[1.55] text-pretty text-tx3">
          Describe it in your own words. Every fix IT has written is searchable from here, whatever the device or app.
        </p>
        <div
          data-tour="ts-search"
          className="mt-1.5 flex h-14 items-center gap-3 rounded-14 border-[1.5px] border-strong bg-sheet pr-2 pl-4.5 shadow-[0_1px_0_var(--line2)] focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--brand-sub)]"
        >
          <Icon name="search" size={22} className="text-mut" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onQuery("")}
            placeholder="e.g. my screens are blank, can't print, wi-fi"
            aria-label="Search every fix"
            className="h-full min-w-0 flex-1 border-0 bg-transparent font-sans fs-15 text-tx outline-none placeholder:fs-13.5 placeholder:text-placeholder"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label="Clear search"
              className="grid size-10 cursor-pointer place-items-center rounded-10 text-mut outline-none hover:bg-hover hover:text-tx focus-visible:outline-2 focus-visible:outline-brand"
            >
              <Icon name="close" size={19} />
            </button>
          )}
        </div>
        {popular.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="mr-0.5 fs-11.5 text-mut">Most looked up</span>
            {popular.map((r) => (
              <Link
                key={r.id}
                to={troubleshootingArticlePath(r.subjectKey, r.id)}
                state={FROM_LIST}
                className="min-h-7.5 rounded-pill border border-line bg-subtle px-3 py-1.25 fs-12 leading-[1.3] text-tx2 no-underline outline-none hover:border-strong hover:text-tx focus-visible:outline-2 focus-visible:outline-brand"
              >
                {shortLabel(r.label)}
              </Link>
            ))}
          </div>
        )}
      </div>
      {support}
    </div>
  );
}

/// ── Search results ───────────────────────────────────────────────────

/** The label with the first occurrence of the search marked. */
function Marked({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (at < 0 || !query.trim()) return <>{text}</>;
  const end = at + query.trim().length;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-3 bg-brand-sub text-brand-tx">{text.slice(at, end)}</mark>
      {text.slice(end)}
    </>
  );
}

export function Results({ rows, query, empty }: { rows: LibraryRow[]; query: string; empty: ReactNode }) {
  return (
    <section aria-label="Search results" className="flex max-w-215 flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <h2 className="m-0 font-head fs-16 font-semibold">
          {rows.length ? `${rows.length} ${rows.length === 1 ? "match" : "matches"}` : "No matches"}
        </h2>
        <span className="fs-12 text-mut">across every device and app</span>
      </div>
      {rows.length > 0 ? (
        <Tray>
          <Sheet key={query} className="overflow-hidden">
            {rows.map((r, i) => (
              <Link
                key={r.id}
                to={troubleshootingArticlePath(r.subjectKey, r.id)}
                state={FROM_LIST}
                style={rowIn(i)}
                className={cn(ROW, ROW_IN, "min-h-12 py-3 pr-4 pl-3", r.hasArticle ? "text-tx" : "text-tx3")}
              >
                <span className="grid size-9 flex-none place-items-center rounded-10 bg-track text-tx2">
                  <Icon name={iconForGlyph(r.glyph)} size={17} weight={300} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.75">
                  <span className="fs-14 leading-[1.4] text-pretty">
                    <Marked text={r.label} query={query} />
                  </span>
                  <span className="fs-11.5 text-mut">
                    {r.categoryName} · {r.subjects.join(", ")}
                  </span>
                </span>
                <Cta written={r.hasArticle} />
              </Link>
            ))}
          </Sheet>
        </Tray>
      ) : (
        empty
      )}
    </section>
  );
}

/** A dashed or plain card saying there's nothing here, and what to do. */
export function EmptyCard({ title, children, actions, dashed }: { title: ReactNode; children: ReactNode; actions?: ReactNode; dashed?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2.5 rounded-14 border bg-sheet p-6",
        dashed ? "border-dashed border-strong" : "border-line"
      )}
    >
      <div className="fs-14 font-semibold text-tx">{title}</div>
      <div className="max-w-[56ch] fs-13 leading-[1.55] text-pretty text-tx3">{children}</div>
      {actions && <div className="mt-1 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/// ── Browsing by subject ──────────────────────────────────────────────

const GROUPS = [
  { kind: "app", label: "Apps & accounts" },
  { kind: "device", label: "Devices" },
] as const;

type RailProps = {
  subjects: LibrarySubject[];
  selected: string | null;
  onPick: (key: string) => void;
  /** The list editor outlines the chosen subject in the brand colour. */
  editing?: boolean;
};

/**
 * A grouped column on a wide screen; one row that scrolls sideways on a
 * narrow one, where the groups' headings would cost more than they say.
 */
export function SubjectRail({ subjects, selected, onPick, editing }: RailProps) {
  const nav = useRef<HTMLElement | null>(null);

  // On a phone the rail scrolls sideways; bring the chosen subject into it.
  // The rail's own scroll only, never the page's.
  useEffect(() => {
    const el = nav.current;
    const on = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !on || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = on.offsetLeft - el.offsetLeft - 12;
  }, [selected, subjects.length]);

  return (
    <aside
      data-tour="ts-subject"
      className={cn("flex min-w-0 flex-col gap-1.5 desk:sticky", editing ? "desk:top-21" : "desk:top-6")}
    >
      <TrayLabel className="px-2.5">{editing ? "Edit list for" : "Or browse"}</TrayLabel>
      <nav ref={nav} aria-label="Devices and apps" className="flex gap-1 overflow-x-auto pb-0.5 desk:flex-col">
        {GROUPS.map((g) => {
          const items = subjects.filter((s) => s.kind === g.kind);
          if (!items.length) return null;
          return (
            <div key={g.kind} className="contents">
              <div className="hidden px-2.5 pt-3 pb-1 fs-11 font-medium text-tx3 desk:block">{g.label}</div>
              {items.map((s) => {
                const on = s.key === selected;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => onPick(s.key)}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex h-9.5 flex-none cursor-pointer items-center gap-2.5 rounded-9 border-0 px-2.5 font-sans fs-13 whitespace-nowrap outline-none hover:bg-hover hover:text-tx focus-visible:outline-2 focus-visible:outline-brand",
                      on
                        ? cn("bg-sheet font-medium text-tx hover:bg-sheet", editing ? "shadow-[0_0_0_1px_var(--brand-line)]" : "shadow-[0_0_0_1px_var(--line)]")
                        : cn("bg-transparent", s.count ? "text-tx2" : "text-mut")
                    )}
                  >
                    <Icon name={iconForSubjectKey(s.key)} size={17} weight={300} />
                    <span className="min-w-0 flex-1 text-left">{s.label}</span>
                    <span className="fs-11 text-mut">{s.count || ""}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

export function SubjectHead({ subject, meta, action }: { subject: LibrarySubject; meta: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3">
      <span className="grid size-11 flex-none place-items-center rounded-12 border border-line bg-sheet text-tx2">
        <Icon name={iconForSubjectKey(subject.key)} size={21} weight={300} />
      </span>
      <div className="flex min-w-0 flex-[1_1_12.5rem] flex-col gap-0.5">
        <h2 className="m-0 font-head fs-20 font-semibold tracking-[-0.01em]">{subject.label}</h2>
        <span className="fs-12 text-mut">{meta}</span>
      </div>
      {action}
    </div>
  );
}

/** One category's symptoms, as the reader sees them. */
export function CategoryCards({ subjectKey, categories }: { subjectKey: string; categories: SymptomCategoryListing[] }) {
  let n = 0;
  return (
    <div key={subjectKey} data-tour="ts-symptoms" className="grid grid-cols-1 items-start gap-3 desk:grid-cols-[repeat(auto-fill,minmax(21.25rem,1fr))]">
      {categories.map((c) => (
        <Tray
          key={c.id}
          label={
            <span className="flex items-center gap-2">
              <Icon name={iconForGlyph(c.glyph)} size={15} className="text-mut" />
              <span className="text-tx3">{c.name}</span>
            </span>
          }
          aside={c.symptoms.length}
        >
          <Sheet className="overflow-hidden">
            {c.symptoms.map((s) => (
              <Link
                key={s.id}
                to={troubleshootingArticlePath(subjectKey, s.id)}
                state={FROM_LIST}
                style={rowIn(n++)}
                className={cn(ROW, ROW_IN, "min-h-12 px-4 py-3", s.hasArticle ? "text-tx" : "text-tx3")}
              >
                <span className="min-w-0 flex-1 fs-13 leading-[1.45] text-pretty">{s.label}</span>
                <Cta written={s.hasArticle} />
              </Link>
            ))}
          </Sheet>
        </Tray>
      ))}
    </div>
  );
}

/** "Edit this list" / "Edit": the admin's way in, outlined in the brand. */
export function EditButton({ onClick, children, className }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={btn({
        size: "md",
        className: cn("h-9 border-brand-line pr-3.25 pl-2.5 fs-12 text-brand-tx hover:bg-brand-sub", className),
      })}
    >
      <Icon name="edit" size={16} />
      {children}
    </button>
  );
}
