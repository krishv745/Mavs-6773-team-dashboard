import type { Subteam } from "@/lib/supabase/types";

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
