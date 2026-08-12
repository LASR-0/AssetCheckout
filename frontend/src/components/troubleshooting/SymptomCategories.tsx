import { Link } from "react-router-dom";
import CollapsibleSection from "@/components/ui/collapsible-section";
import { Badge } from "@/components/ui/statusbadge";
import { FROM_SYMPTOM_LIST, troubleshootingArticlePath } from "@/lib/troubleshootingRoutes";
import type { SymptomCategoryListing } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |                    SYMPTOM CATEGORIES                           |
///  +-----------------------------------------------------------------+
//
//  The "what's happening?" accordion. One section per category, symptoms
//  inside, each a link to its own article route.
//
//  LINKS, NOT BUTTONS. The prototype held the open article in component
//  state, which meant nothing on the page could be linked to. IT sending
//  somebody a direct link to the right article is a large part of the value
//  here, so every symptom is a real route — and being an <a> also means
//  middle-click and copy-link-address work, which a button swallows.
///  +-----------------------------------------------------------------+

/** The Draft pill. Built on Badge — the app's one badge shell — with its own
 *  vocabulary, rather than a second pill implementation. */
function DraftBadge() {
  return (
    <Badge
      icon="edit_note"
      label="Draft"
      bg="bg-surface-container-low/40"
      text="text-info-light"
      size="compact"
    />
  );
}

/** The category's glyph tile. The glyph is authored with the content. */
function CategoryGlyph({ glyph }: { glyph: string }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm text-primary">
      {glyph}
    </span>
  );
}

type Props = {
  subjectKey: string;
  categories: SymptomCategoryListing[];
  /** Category ids currently expanded. Controlled so search can reveal matches. */
  openIds: string[];
  onOpenChange: (categoryId: string, open: boolean) => void;
};

export default function SymptomCategories({
  subjectKey,
  categories,
  openIds,
  onOpenChange,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      {categories.map((category) => (
        <CollapsibleSection
          key={category.id}
          title={category.name}
          subtitle={category.blurb}
          leading={<CategoryGlyph glyph={category.glyph} />}
          meta={`${category.symptoms.length} ${
            category.symptoms.length === 1 ? "issue" : "issues"
          }`}
          open={openIds.includes(category.id)}
          onOpenChange={(open) => onOpenChange(category.id, open)}
        >
          <ul className="flex flex-col">
            {category.symptoms.map((symptom) => (
              <li key={symptom.id}>
                <Link
                  to={troubleshootingArticlePath(subjectKey, symptom.id)}
                  // Tags the article's history entry so its "All symptoms"
                  // links know this list is directly behind them and can go
                  // genuinely back to it — see hooks/useSubjectBackNav.
                  state={{ [FROM_SYMPTOM_LIST]: true }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-on-background hover:bg-surface-container-low/30 transition-colors"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-info-light" />
                  <span className="min-w-0 flex-1">{symptom.label}</span>
                  {symptom.hasArticle ? (
                    <span className="shrink-0 text-xs font-semibold text-info-light">
                      View steps →
                    </span>
                  ) : (
                    <DraftBadge />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ))}
    </div>
  );
}
