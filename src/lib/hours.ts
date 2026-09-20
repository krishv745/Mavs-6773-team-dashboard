export const WEEKLY_MINIMUM_MINUTES = 6 * 60;

export function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Minutes of open-ended sessions are counted up to `now`. */
export function sessionMinutes(clockIn: string, clockOut: string | null, now: number) {
  const end = clockOut ? new Date(clockOut).getTime() : now;
  return Math.max(0, (end - new Date(clockIn).getTime()) / 60000);
}
