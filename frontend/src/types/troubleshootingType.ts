///  +-----------------------------------------------------------------+
///  |                   TROUBLESHOOTING TYPES                         |
///  +-----------------------------------------------------------------+
//
//  Mirrors the shapes the backend's troubleshooting repository serves. The
//  authority for these is the Zod schema in
//  backend/src/content/troubleshooting/schema.ts — if a field changes there,
//  it changes here.
///  +-----------------------------------------------------------------+

export type DeviceKey =
  | "laptop"
  | "desktop"
  | "phone"
  | "tablet"
  | "monitor"
  | "headphones"
  | "mouse"
  | "keyboard"
  | "webcam";

/** A tile in the device picker. `available` false renders it disabled. */
export type DevicePickerTile = {
  key: DeviceKey;
  label: string;
  labelSingular: string;
  symptomCount: number;
  articleCount: number;
  available: boolean;
};

export type DeviceSummary = Omit<DevicePickerTile, "available">;

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
  targetDeviceKey?: DeviceKey;
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
  deviceKey: DeviceKey;
  summary: string;
  timeEstimate: string;
  appliesTo: string;
  /** ISO date, authored rather than derived from git. */
  updated: string;
  before: string[];
  steps: Step[];
};

export type DeviceCategoriesResponse = {
  device: DeviceSummary;
  categories: SymptomCategoryListing[];
};

/** `article` is null for a symptom nobody has written up yet. */
export type SymptomResponse = {
  device: DeviceSummary;
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
