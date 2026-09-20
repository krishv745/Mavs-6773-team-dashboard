// Server Components render on Vercel's servers (UTC), not the visitor's
// browser, so any `.toLocaleString()`-style call with no `timeZone` option
// formats in UTC instead of Central. Every display of a real timestamp
// (clock_in/out, task_logs.timestamp, created_at, etc.) must go through one
// of these helpers instead, so it's always shown in the team's timezone.
const TIME_ZONE = "America/Chicago";

function format(value: Date | string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, ...options }).format(new Date(value));
}

/** "2:30 PM" */
export function formatClockTime(value: Date | string) {
  return format(value, { hour: "numeric", minute: "2-digit" });
}

/** "8/21/2026, 2:30 PM" */
export function formatClockDateTime(value: Date | string) {
  return format(value, { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "8/21/2026" */
export function formatShortDate(value: Date | string) {
  return format(value, { month: "numeric", day: "numeric", year: "numeric" });
}

/** "Friday, August 21, 2026" */
export function formatLongDate(value: Date | string) {
  return format(value, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/**
 * Calendar-only values (`deadline`, `events.date` — Postgres `date`
 * columns with no time-of-day) carry no instant to convert to a timezone:
 * a deadline of Aug 21 is Aug 21 for everyone. Format the Y-M-D components
 * directly instead of parsing the string through `new Date()`, which would
 * shift the day near a UTC/Central offset boundary.
 */
export function formatCalendarDate(isoDate: string, options?: Intl.DateTimeFormatOptions) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "numeric",
    day: "numeric",
    year: "numeric",
    ...options,
  }).format(Date.UTC(year, month - 1, day));
}
