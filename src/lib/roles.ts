import type { UserRole } from "@/lib/supabase/types";

/** Roles that can be selected as an event's visible-to audience. */
export const EVENT_VISIBILITY_ROLES: { value: UserRole; label: string }[] = [
  { value: "team_lead", label: "Team Lead" },
  { value: "member", label: "Team Member" },
  { value: "parent", label: "Parent" },
];

export function roleLabel(role: UserRole) {
  switch (role) {
    case "owner":
      return "Owner";
    case "team_lead":
      return "Team Lead";
    case "parent":
      return "Parent";
    default:
      return "Team Member";
  }
}
