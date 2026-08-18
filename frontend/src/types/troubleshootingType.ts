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

/** A link to somewhere outside the troubleshooting library. */
export type ExternalLink = {
  label: string;
  url: string;
};

export type Step = {
  title: string;
  body: string;
  note?: string;
  warn?: string;
  figure?: Figure;
  branch?: Branch;
  /** A link out of the library — see linkSchema on the backend for why this
   *  is a block rather than a URL written into `body`. */
  link?: ExternalLink;
  /**
   * The order to show the optional blocks in, when it is not the default.
   *
   * A display hint over four named fields rather than a content model — see
   * lib/troubleshootingBlocks.ts, and use `orderedBlocks` rather than reading
   * this directly. Absent means the default order, which is what every
   * article written before it existed relies on.
   */
  blockOrder?: ("note" | "warn" | "figure" | "branch" | "link")[];
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
  /**
   * False hides the messaging option entirely.
   *
   * No placeholder equivalent to the phone number's "XXXX XXX XXX": a number
   * shaped like a number is honestly unconfigured, but a button that opens
   * nothing just looks broken.
   */
  supportChannelConfigured: boolean;
  /** For the button and the modal — "post it in #it-support". */
  supportChannelName: string;
};

/** A composed support message, and where it is meant to go. */
export type SupportMessageDraft = {
  /** The finished text, ready to paste. Composed server-side. */
  text: string;
  channelUrl: string | null;
  channelName: string;
  /** The article's steps, to tick off. */
  steps: { index: number; title: string }[];
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
  /**
   * The live text, or NULL for an article that has never been published —
   * created here and still being written. The editor shows the draft in that
   * case, because there is nothing else to show.
   */
  published: ArticleBody | null;
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
  /**
   * Whether readers can see it at all.
   *
   * False with `hasArticle` true means started but never published — the
   * article exists here and nowhere else, and the reader still sees Draft.
   * Without this the editor would show a started article as finished.
   */
  published: boolean;
};

export type EditableCategory = {
  id: string;
  glyph: string;
  name: string;
  blurb: string;
  disabled: boolean;
  symptoms: EditableSymptom[];
};

/** What a new symptom's permanent address will be, checked before creating it. */
export type SlugPreview = {
  slug: string;
  available: boolean;
  /** Why not, when it isn't. Written for a person. */
  reason?: string;
};

/** A branch button in another article pointing at a symptom. */
export type SymptomLink = {
  /** Where it is — `laptop/print-cloud-error`. */
  from: string;
  subjectKey: string;
  symptomId: string;
  /** 1-based, as the reader sees it. */
  step: number;
  label: string;
  /** True when the branch is in unpublished text rather than live. */
  inDraft: boolean;
};

export type DeletedSymptom = {
  subjectKey: string;
  symptomId: string;
  label: string;
  archived: boolean;
  brokenLinks: SymptomLink[];
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
