import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/supabase/types";
import { PERMISSIONS, type PermissionKey, isPermissionKey } from "@/lib/permissions";

// hasPermission() itself lives in @/lib/permissions (no server-only
// dependencies) so Client Components can use it directly on a profile
// that's already been fetched server-side — re-exported here so every
// existing `import { hasPermission } from "@/lib/auth/session"` still works.
export { hasPermission } from "@/lib/permissions";

export type Profile = UserRow & { permissions: Set<PermissionKey> };

/**
 * Fetches the signed-in user's row plus their role's permission set (one
 * extra query, not one per permission check — hasPermission() below just
 * reads the already-loaded Set). Owner bypasses the table entirely and
 * always gets every permission; see isOwner() for why that's hardcoded
 * rather than data-driven.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("users").select("*").eq("id", user.id).single();
  if (!profile) return null;

  if (profile.role === "owner") {
    return { ...profile, permissions: new Set(PERMISSIONS.map((p) => p.key)) };
  }

  let permissions = new Set<PermissionKey>();
  if (profile.role_id) {
    const { data: rows } = await supabase
      .from("role_permissions")
      .select("permission_key")
      .eq("role_id", profile.role_id);
    permissions = new Set(
      (rows ?? []).map((r) => r.permission_key).filter((key): key is PermissionKey => isPermissionKey(key)),
    );
  }

  return { ...profile, permissions };
}

/**
 * The literal Owner — hardcoded rather than a permission on purpose. A
 * handful of actions (deleting a member's account, granting anyone
 * Owner/Team-Lead-tier access) touch the "there's always exactly one Owner"
 * invariant, which isn't something any role's permissions should be able to
 * delegate away.
 */
export function isOwner(profile: Pick<UserRow, "role"> | null | undefined) {
  return profile?.role === "owner";
}

/**
 * Parent accounts only ever see the Events tab — a structural navigation
 * rule, not a permission, so it stays keyed off the tier every role
 * (including custom ones) still maps to.
 */
export function isParent(profile: Pick<UserRow, "role"> | null | undefined) {
  return profile?.role === "parent";
}
