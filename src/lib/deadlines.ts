/**
 * Allowed range for project/task deadlines: no earlier than one year before
 * today, no later than 2100. Shared by the date inputs (as min/max, so the
 * calendar greys out older dates) and the server actions (which re-check).
 */
export const MAX_DEADLINE = "2100-12-31";

export function minDeadline(now = new Date()) {
  const d = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Returns an error message, or null if `iso` is a full date in the allowed range. */
export function deadlineError(iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "Enter a full date.";
  if (iso < minDeadline()) return "Date can't be more than a year in the past.";
  if (iso > MAX_DEADLINE) return "Not a valid date.";
  return null;
}
