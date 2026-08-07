///  +-----------------------------------------------------------------+
///  |                   TROUBLESHOOTING TYPES                         |
///  +-----------------------------------------------------------------+
//
//  Mirrors the shapes the backend's troubleshooting repository serves. The
//  authority for these is the Zod schema in
//  backend/src/content/troubleshooting/schema.ts — if a field changes there,
//  it changes here.
///  +-----------------------------------------------------------------+

export type SubjectKey =
  | "laptop"
  | "desktop"
  | "phone"
  | "tablet"
  | "monitor"
  | "headphones"
  | "mouse"
  | "keyboard"
  | "webcam"
  | "dock"
  | "printer"
  | "outlook"
  | "onedrive"
  | "sharepoint"
  | "sap"
  | "ess";

/** Devices get tiles; applications get their own section above them. */
export type SubjectKind = "device" | "app";

/** An entry in the picker. `available` false renders it disabled. */
export type SubjectPickerTile = {
  key: SubjectKey;
  kind: SubjectKind;
  label: string;
  labelSingular: string;
  symptomCount: number;
  articleCount: number;
  available: boolean;
  /** Snipe category ids that resolve to this subject, for deep linking in
   *  from somewhere that knows a category rather than a subject. Always
   *  empty for applications — nothing in Snipe is an Outlook. */
  categoryIds: number[];
};

export type SubjectSummary = Omit<SubjectPickerTile, "available" | "categoryIds">;

/** A symptom. `hasArticle` false is the Draft state — listed, not hidden. */
export type SymptomListing = {
  id: string;
  label: string;
  hasArticle: boolean;
};

export type SymptomCategoryListing = {
  id: string;
  glyph: string;
  name: string;
  blurb: string;
  symptoms: SymptomListing[];
};

export type Branch = {
  label: string;
  targetSymptomId: string;
  targetSubjectKey?: SubjectKey;
};

export type Step = {
  title: string;
  body: string;
  note?: string;
  warn?: string;
  /** A caption, not an image path — v1 ships no screenshots. */
  figure?: string;
  branch?: Branch;
};

export type Article = {
  symptomId: string;
  subjectKeys: SubjectKey[];
  summary: string;
  timeEstimate: string;
  appliesTo: string;
  /** ISO date, authored rather than derived from git. */
  updated: string;
  before: string[];
  steps: Step[];
  /** Where ported content came from, so a reviewer knows what to re-check. */
  source?: { name: string; url: string };
};

export type SubjectCategoriesResponse = {
  subject: SubjectSummary;
  categories: SymptomCategoryListing[];
};

/** `article` is null for a symptom nobody has written up yet. */
export type SymptomResponse = {
  subject: SubjectSummary;
  symptom: SymptomListing;
  category: { id: string; name: string; glyph: string };
  article: Article | null;
  siblings: SymptomListing[];
};

export type TroubleshootingConfig = {
  supportPhone: string;
  /** False when the number is the XXXX placeholder. */
  supportPhoneConfigured: boolean;
};
