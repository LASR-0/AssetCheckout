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