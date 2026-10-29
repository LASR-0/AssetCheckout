import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// tailwind-merge only knows Tailwind's default scales, so it would keep both
// `fs-13.5` and `fs-12` (or `rounded-9` and `rounded-7`) and let stylesheet
// order decide the winner. Teach it the design scales from styles/tokens.css
// so a caller's className reliably overrides a component's default.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "14", "16", "pill"],
      tracking: ["label", "head"],
    },
    classGroups: {
      "font-size": [{ fs: [(value: string) => /^\d+(\.\d+)?$/.test(value)] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(name?: string): string {
  if (!name) return "";

  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}


