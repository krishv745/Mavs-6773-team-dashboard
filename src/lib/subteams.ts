import type { Subteam, TaskStageKind } from "@/lib/supabase/types";

export const SUBTEAMS: { value: Subteam; label: string }[] = [
  { value: "mechanical", label: "Mechanical" },
  { value: "electrical", label: "Electrical" },
  { value: "cad", label: "CAD" },
  { value: "software", label: "Software" },
  { value: "outreach", label: "Outreach" },
  { value: "marketing", label: "Marketing" },
];

/** Compact labels for tight columns (the Projects board's subteam select). */
export const SUBTEAM_SHORT: Record<Subteam, string> = {
  mechanical: "Mech",
  electrical: "Elec",
  cad: "CAD",
  software: "SW",
  outreach: "Outr",
  marketing: "Mktg",
};

export function subteamLabel(value: Subteam) {
  return SUBTEAMS.find((s) => s.value === value)?.label ?? value;
}

export function isSubteam(value: unknown): value is Subteam {
  return typeof value === "string" && SUBTEAMS.some((s) => s.value === value);
}

/** Stages a task can move through after its own subteam: every subteam, plus Testing. */
export const STAGE_KINDS: { value: TaskStageKind; label: string }[] = [
  ...SUBTEAMS,
  { value: "testing", label: "Testing" },
];

/** Compact stage labels for tight spaces (calendar cells). */
export const STAGE_SHORT: Record<TaskStageKind, string> = { ...SUBTEAM_SHORT, testing: "Test" };

export function stageLabel(value: TaskStageKind) {
  return STAGE_KINDS.find((s) => s.value === value)?.label ?? value;
}

export function isStageKind(value: unknown): value is TaskStageKind {
  return typeof value === "string" && STAGE_KINDS.some((s) => s.value === value);
}
