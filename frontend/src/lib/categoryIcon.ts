const ICON_RULES: { icon: string; keywords: string[] }[] = [
  { icon: "headphones", keywords: ["headphone", "headset", "earphone", "earbud"] },
  { icon: "smartphone", keywords: ["phone", "mobile", "cell", "iphone"] },
  { icon: "tablet", keywords: ["tablet", "ipad"] },
  { icon: "laptop_mac", keywords: ["laptop", "macbook", "notebook", "ultrabook"] },
  { icon: "desktop_windows", keywords: ["desktop", "pc", "workstation", "tower"] },
  { icon: "monitor", keywords: ["monitor", "display", "screen"] },
  { icon: "print", keywords: ["printer", "scanner"] },
  { icon: "keyboard", keywords: ["keyboard"] },
  { icon: "mouse", keywords: ["mouse"] },
  { icon: "router", keywords: ["router", "switch", "network"] },
  { icon: "dns", keywords: ["server", "rack"] },
  { icon: "videocam", keywords: ["camera", "webcam"] },
  { icon: "cable", keywords: ["cable", "adapter", "dongle"] },
];

const FALLBACK_ICON = "category";

/**
 * Icons for the troubleshooting subject keys — devices and applications.
 *
 * Here rather than beside the troubleshooting components so the two icon
 * vocabularies stay one vocabulary — a category that shows `laptop_mac` in
 * the request form must not show something else on the device picker. The
 * glyphs below are lifted straight from the rules above for that reason.
 *
 * Keyed on the device key rather than matched on a name, because by this
 * point the backend has already done the name resolution.
 */
const SUBJECT_KEY_ICONS: Record<string, string> = {
  laptop: "laptop_mac",
  desktop: "desktop_windows",
  phone: "smartphone",
  tablet: "tablet",
  monitor: "monitor",
  headphones: "headphones",
  mouse: "mouse",
  keyboard: "keyboard",
  webcam: "videocam",
  dock: "dock",
  printer: "print",

  // Applications. Material Symbols has no brand glyphs, so these say what
  // the thing DOES rather than pretending to be a logo.
  outlook: "mail",
  onedrive: "cloud",
  sharepoint: "folder_shared",
  sap: "account_balance",
  ess: "badge",
};

export function iconForSubjectKey(key: string): string {
  return SUBJECT_KEY_ICONS[key] ?? FALLBACK_ICON;
}

export function iconForCategory(name: string): string {
  const lower = name.toLowerCase();
  for (const rule of ICON_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.icon;
    }
  }
  return FALLBACK_ICON;
}

export function isPhoneCategory(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.includes("headphone") || lower.includes("earphone")) return false;
  return ["phone", "mobile", "cell", "iphone"].some((kw) => lower.includes(kw));
}

export function isTabletCategory(name: string): boolean {
  const lower = name.toLowerCase();
  return ["tablet", "ipad"].some((kw) => lower.includes(kw));
}