import { DEVICE_KEYS, type DeviceKey, type SubjectKey } from "./schema.js";

///  +-----------------------------------------------------------------+
///  |          SUBJECT NAMES  +  SNIPE CATEGORY RESOLUTION            |
///  +-----------------------------------------------------------------+
//
//  Content is keyed on a stable device key, but everything the app knows
//  about what a person can request or holds is keyed on a Snipe category —
//  whose id is a per-instance integer and whose name is whatever an admin
//  typed. This is the join between the two.
//
//  It matches on the NAME, by keyword, because that is the only stable thing
//  about a Snipe category across instances. That is the same bargain
//  frontend/src/lib/categoryIcon.ts already makes to choose an icon, and this
//  deliberately mirrors its keyword vocabulary so a category that shows a
//  laptop icon doesn't resolve to some other device here.
//
//  ORDER IS LOAD-BEARING. "Headphones" contains "phone", so headphones must
//  be tested before phones or every headset in the catalogue becomes a
//  mobile. categoryIcon.ts has the same ordering and an explicit exclusion in
//  isPhoneCategory for exactly this reason.
///  +-----------------------------------------------------------------+

/// ── Device labels ────────────────────────────────────────────────────────
//
//  Here rather than in the content files because the picker has to name
//  devices the content library has never heard of: a category can be
//  requestable, and therefore earn a tile, while nothing has been authored
//  for it yet. Keeping the labels with the taxonomy meant an unwritten device
//  had no name to render, and adding a fallback would have made two places
//  that both claim to say what a phone is called.
//
//  A closed set that changes about never, so a static map keyed on the enum
//  is the honest shape. Applications are in here too: they never come from
//  Snipe, but they still need a name on a tile.
export const SUBJECT_LABELS: Record<SubjectKey, { label: string; labelSingular: string }> = {
  laptop: { label: "Laptops", labelSingular: "laptop" },
  desktop: { label: "Desktops", labelSingular: "desktop" },
  phone: { label: "Phones", labelSingular: "phone" },
  tablet: { label: "Tablets", labelSingular: "tablet" },
  monitor: { label: "Monitors", labelSingular: "monitor" },
  headphones: { label: "Headphones", labelSingular: "headset" },
  mouse: { label: "Mice", labelSingular: "mouse" },
  keyboard: { label: "Keyboards", labelSingular: "keyboard" },
  webcam: { label: "Webcams", labelSingular: "webcam" },
  dock: { label: "Docks", labelSingular: "dock" },
  printer: { label: "Printers", labelSingular: "printer" },

  // Applications. "Troubleshoot your OneDrive" reads oddly, so the singular
  // is phrased to sit in that sentence rather than being a bare noun.
  outlook: { label: "Email & Outlook", labelSingular: "email" },
  onedrive: { label: "OneDrive", labelSingular: "OneDrive" },
  sharepoint: { label: "SharePoint", labelSingular: "SharePoint" },
  sap: { label: "SAP", labelSingular: "SAP account" },
  ess: { label: "ESS", labelSingular: "ESS account" },
};

type Rule = {
  key: DeviceKey;
  /** Matched anywhere in the name. Use for distinctive, multi-character words. */
  keywords?: string[];
  /**
   * Matched only as a whole word. For short or swallowable tokens — "pc"
   * otherwise matches "PCB", "HPC" and the middle of plenty of model names.
   */
  words?: string[];
};

const RULES: Rule[] = [
  // Accessories that contain another device's keyword go first.
  { key: "headphones", keywords: ["headphone", "headset", "earphone", "earbud", "earpiece"] },
  { key: "webcam", keywords: ["webcam", "web cam"] },

  { key: "keyboard", keywords: ["keyboard"] },
  { key: "mouse", keywords: ["mouse"], words: ["mice"] },
  { key: "monitor", keywords: ["monitor", "display"], words: ["screen", "screens"] },
  { key: "tablet", keywords: ["tablet", "ipad"] },
  { key: "laptop", keywords: ["laptop", "macbook", "notebook", "ultrabook"] },
  { key: "desktop", keywords: ["desktop", "workstation"], words: ["pc", "pcs", "tower", "towers"] },
  { key: "phone", keywords: ["phone", "mobile", "smartphone", "handset"], words: ["cell", "cells"] },
  // Neither is requestable today, so these only matter if that changes — but
  // the mapping costs nothing and its absence would be a silent gap.
  { key: "dock", keywords: ["dock", "docking"] },
  { key: "printer", keywords: ["printer", "mfd", "multifunction"] },
];

/** Word-boundary test that survives punctuation and hyphens in category names. */
function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`(?:^|[^a-z0-9])${word}(?:[^a-z0-9]|$)`).test(haystack);
}

/**
 * Resolve a Snipe category name to a device key, or null when it isn't a
 * device we troubleshoot.
 *
 * Null is the common and correct answer for plenty of real categories —
 * printers, docking stations, licences, cables. They drop out of the picker
 * rather than becoming a tile with nothing behind it.
 */
export function deviceKeyForCategoryName(name: string): DeviceKey | null {
  const lower = name.toLowerCase();

  for (const rule of RULES) {
    if (rule.keywords?.some((kw) => lower.includes(kw))) return rule.key;
    if (rule.words?.some((w) => hasWord(lower, w))) return rule.key;
  }

  return null;
}

/**
 * Resolve a list of Snipe categories to the distinct device keys they cover,
 * in DEVICE_KEYS order so the picker's tile order is stable regardless of
 * what order Snipe returned the categories in.
 *
 * Several categories collapsing to one key is normal and intended: an
 * instance with separate "iPhones" and "Android Phones" categories gets one
 * phone tile, because the content library is not split that way.
 */
export function deviceKeysForCategories(
  categories: { name: string }[]
): DeviceKey[] {
  const found = new Set<DeviceKey>();

  for (const category of categories) {
    const key = deviceKeyForCategoryName(category.name);
    if (key) found.add(key);
  }

  return DEVICE_KEYS.filter((key) => found.has(key));
}
