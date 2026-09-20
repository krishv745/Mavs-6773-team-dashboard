export function formatEventTimeRange(startTime: string | null, endTime: string | null) {
  if (!startTime) return "";
  const start = startTime.slice(0, 5);
  if (!endTime) return ` · ${start}`;
  return ` · ${start}–${endTime.slice(0, 5)}`;
}
