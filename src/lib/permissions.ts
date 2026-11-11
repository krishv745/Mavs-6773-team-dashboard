/**
 * The fixed permission catalog. Adding a new capability to the app means
 * adding a key here (and granting it to the relevant system roles' default
 * set in schema.sql) — the Owner can then assign it to any role from the
 * Admin Dashboard's Roles panel.
 *
 * A few actions are deliberately NOT permissions and stay hardcoded to the
 * literal Owner (see isOwner()): deleting a member's account, and granting
 * anyone Owner/Team-Lead-tier access. Both touch the "there's always exactly
 * one Owner" invariant, which isn't something any role should be able to
 * delegate away.
 */
export const PERMISSIONS = [
  {
    key: "add_logs",
    label: "Add work logs",
    description: "Post work logs on tasks (on the dashboard, via the chat assistant, or with Google Chat /debrief)",
  },
  {
    key: "contribute",
    label: "Contribute",
    description: "Sign up to volunteer, add/edit parts, create Build projects, and move stock",
  },
  {
    key: "create_tasks",
    label: "Add tasks & projects",
    description: "Create new projects on the Projects tab and add tasks to them",
  },
  {
    key: "edit_tasks",
    label: "Edit tasks",
    description: "Edit, archive/unarchive tasks, and change who's assigned",
  },
  {
    key: "delete_tasks",
    label: "Delete tasks",
    description: "Permanently delete a task and its log entries",
  },
  {
    key: "edit_projects",
    label: "Edit projects",
    description: "Change a project's deadline and color",
  },
  {
    key: "delete_projects",
    label: "Delete projects",
    description: "Permanently delete a project and every task inside it",
  },
  {
    key: "manage_events",
    label: "Manage events",
    description: "Create/edit events, assign volunteers, cancel someone else's sign-up",
  },
  {
    key: "delete_events",
    label: "Delete events",
    description: "Permanently delete an event and its sign-ups",
  },
  {
    key: "manage_parts",
    label: "Manage parts",
    description: "Add, edit, or delete parts; import a BOM; fetch missing images",
  },
  {
    key: "manage_members",
    label: "Manage members",
    description: "Add members, reset passwords, edit member info, change roles (Senior Team Lead is Owner-only)",
  },
  {
    key: "manage_roles",
    label: "Manage roles",
    description: "Create, delete, and edit custom roles and their permissions",
  },
  {
    key: "view_admin_hours",
    label: "View activity report",
    description: "View the Admin Dashboard's Activity Report of everything logged",
  },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key);

export function isPermissionKey(value: string): value is PermissionKey {
  return (ALL_PERMISSION_KEYS as string[]).includes(value);
}

/**
 * Does this profile have the given permission? Owner always does, regardless
 * of role_permissions. Deliberately has no server-only dependencies (pure
 * Set lookup) so it can be called from Client Components too — the profile
 * (with its permissions already loaded) comes down as a prop from a Server
 * Component via getCurrentProfile().
 */
export function hasPermission(
  profile: { role: string; permissions?: Set<PermissionKey> } | null | undefined,
  key: PermissionKey,
): boolean {
  if (!profile) return false;
  if (profile.role === "owner") return true;
  return profile.permissions?.has(key) ?? false;
}
