/** Math for the Projects board's per-task deadline progress bar. */

function toTimestamp(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getTime();
}

/**
 * How far a single task has traveled from when it was created toward its own
 * deadline, as a 0-100 percentage — the fill for the Projects board's
 * per-task Timeline column. Pins to 100 once the deadline has passed rather
 * than dividing by a non-positive span.
 */
export function taskDuePercent(createdAtIso: string, deadlineIso: string): number {
  const start = new Date(createdAtIso).getTime();
  const end = toTimestamp(deadlineIso);
  if (end <= start) return 100;
  return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
}

/** Whole days between today and an ISO date — negative once it's in the past. */
export function daysUntil(isoDate: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((toTimestamp(isoDate) - toTimestamp(today)) / (24 * 60 * 60 * 1000));
}
