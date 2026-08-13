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

/** One picture, with an optional dark-theme twin. `src` is relative to
 *  /troubleshooting/. */
export type FigureImage = {
  src: string;
  /** Dark-theme variant. When absent, `src` is used in both themes. */
  srcDark?: string;
};

/** Caption required, screenshots optional — the words are the content and
 *  the pictures are the aid. */
export type Figure = {
  /** In the order the reader walks them: the menu first, then where it lands. */
  images?: FigureImage[];
  /**
   * How much room the picture needs. Omitted is a small UI flyout;
   * "window" an application window; "full" a whole-screen capture whose
   * detail is illegible at anything less.
   */
  size?: "window" | "full";
  caption: string;
};

export type Step = {
  title: string;
  body: string;
  note?: string;
  warn?: string;
  figure?: Figure;
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

///  +-----------------------------------------------------------------+
///  |                   ADMIN EDITING (admin only)                    |
///  +-----------------------------------------------------------------+
//
//  These are the shapes the editor works in, and they differ from the public
//  ones in two ways worth stating.
//
//  THE TEXT IS RAW. Public responses have already had {device} substituted
//  for the reader's own subject; these have not, because an editor has to see
//  and keep the token. Editing substituted text would silently freeze a
//  shared article to whichever subject it was opened under.
//
//  NOTHING IS FILTERED. Hidden symptoms and disabled categories are present,
//  because they cannot be switched back on if the editor cannot see them.

/** An article without its identity — what a draft actually contains. */
export type ArticleBody = Omit<Article, "symptomId" | "subjectKeys">;

export type EditableArticle = {
  symptomId: string;
  /** Every subject listing this article. More than one means an edit here
   *  changes what readers of the others see. */
  subjectKeys: SubjectKey[];
  hidden: boolean;
  published: ArticleBody;
  /** Unpublished changes, or null when there are none. */
  draft: ArticleBody | null;
  publishedAt: string;
  publishedBy: string | null;
  draftUpdatedAt: string | null;
  draftUpdatedBy: string | null;
};

export type EditableSymptom = {
  id: string;
  label: string;
  hasArticle: boolean;
  hidden: boolean;
  hasDraft: boolean;
};

export type EditableCategory = {
  id: string;
  glyph: string;
  name: string;
  blurb: string;
  disabled: boolean;
  symptoms: EditableSymptom[];
};

/** What the publish gate refused, or what the server couldn't accept. */
export type ContentIssue = { path: string; message: string };

export type PublishResult = {
  publishedAt: string;
  hasDraft: false;
  /** Published anyway — a missing screenshot degrades, it doesn't mislead. */
  warnings: string[];
};

export type UploadedImage = {
  src: string;
  srcDark?: string;
  width: number;
  height: number;
  bytes: number;
};

export type ContentHealth = {
  missingImages: { subjectKey: string; symptomId: string; step: number; src: string }[];
  orphanImages: string[];
  danglingBranches: { from: string; step: number; to: string; label: string }[];
  drafts: {
    subjectKey: string;
    symptomId: string;
    draftUpdatedAt: string;
    draftUpdatedBy: string | null;
  }[];
  imageProcessingAvailable: boolean;
};
