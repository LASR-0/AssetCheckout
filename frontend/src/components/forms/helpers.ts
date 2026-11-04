/** Bring a form section into view (the steps rail, the error list). */
export function goToSection(id: string) {
  document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** "Sarah Kim" → "SK". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** "Laptops" → "laptop", for sentences about one of them. */
export function nounFor(categoryName: string | null | undefined): string | null {
  if (!categoryName) return null;
  const n = categoryName.trim().toLowerCase();
  return n.endsWith("s") && !n.endsWith("ss") ? n.slice(0, -1) : n;
}
