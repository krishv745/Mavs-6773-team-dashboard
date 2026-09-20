// Deterministic color assignment per event category — same category always
// gets the same color, without needing to store a color on the category row.
const PALETTE = [
  { badge: "bg-navy/10 text-navy", dot: "bg-navy" },
  { badge: "bg-crimson/10 text-crimson", dot: "bg-crimson" },
  { badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  { badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  { badge: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  { badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  { badge: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
  { badge: "bg-teal-100 text-teal-700", dot: "bg-teal-500" },
];

const NO_CATEGORY = { badge: "bg-ink/5 text-ink/50", dot: "bg-ink/30" };

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function categoryColor(categoryId: string | null | undefined) {
  if (!categoryId) return NO_CATEGORY;
  return PALETTE[hashString(categoryId) % PALETTE.length];
}
