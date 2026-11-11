import type { UserRole } from "@/lib/supabase/types";

/**
 * System role names. Each role maps to one of the fixed tiers in
 * users.role (owner / team_lead / member) — two system roles share the
 * member tier: "Team Lead" (full member access) and "Team Member"
 * (can only add work logs — its one permission is `add_logs`).
 */
export const SYSTEM_ROLE_NAMES = {
  owner: "Owner",
  seniorTeamLead: "Senior Team Lead",
  teamLead: "Team Lead",
  teamMember: "Team Member",
} as const;

/** Which system role a new account or new custom role starts from, per tier. */
export const DEFAULT_SYSTEM_ROLE_FOR_TIER: Partial<Record<UserRole, string>> = {
  owner: SYSTEM_ROLE_NAMES.owner,
  team_lead: SYSTEM_ROLE_NAMES.seniorTeamLead,
  member: SYSTEM_ROLE_NAMES.teamLead,
};

/**
 * Choices in the Add Member form: the value is posted to createMemberAction,
 * which resolves it to a tier + system role.
 */
export const NEW_MEMBER_ROLE_CHOICES = [
  { value: "viewer", label: "Team Member — can only add work logs", tier: "member", roleName: SYSTEM_ROLE_NAMES.teamMember },
  { value: "member", label: "Team Lead — full app access", tier: "member", roleName: SYSTEM_ROLE_NAMES.teamLead },
  {
    value: "team_lead",
    label: "Senior Team Lead — Admin Dashboard access",
    tier: "team_lead",
    roleName: SYSTEM_ROLE_NAMES.seniorTeamLead,
  },
] as const satisfies readonly { value: string; label: string; tier: UserRole; roleName: string }[];

/** Roles that can be selected as an event's visible-to audience. */
export const EVENT_VISIBILITY_ROLES: { value: UserRole; label: string }[] = [
  { value: "team_lead", label: "Senior Team Lead" },
  { value: "member", label: "Team Lead & Team Member" },
];

/**
 * Label for a tier. Prefer the user's actual role name (roles.name) where
 * it's available — the member tier covers both Team Lead and the logs-only
 * Team Member role.
 */
export function roleLabel(role: UserRole) {
  switch (role) {
    case "owner":
      return "Owner";
    case "team_lead":
      return "Senior Team Lead";
    default:
      return "Team Lead";
  }
}
