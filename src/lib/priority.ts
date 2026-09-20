import type { TaskPriority } from "@/lib/supabase/types";

export const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function priorityLabel(value: TaskPriority) {
  return PRIORITIES.find((p) => p.value === value)?.label ?? value;
}

/** Sort helper — lower number sorts first, so highest priority lands on top. */
export const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

/** Pill colors for the read-only priority badge — color-coded by urgency, same idea as a subteam pill. */
export const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "bg-black/5 text-ink/50",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-crimson/10 text-crimson",
};
