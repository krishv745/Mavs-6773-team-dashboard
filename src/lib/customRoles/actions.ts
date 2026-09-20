"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { isPermissionKey } from "@/lib/permissions";
import type { UserRole } from "@/lib/supabase/types";

const OWNER_GATED_TIERS: UserRole[] = ["team_lead", "owner"];
const VALID_TIERS: UserRole[] = ["member", "parent", "team_lead", "owner"];

/**
 * Requires manage_roles. Creates a custom-named role. It starts out mapped
 * to a base tier (still used for the handful of structural, non-permission
 * checks — see schema.sql's comment on the roles table) and copies that
 * tier's current default permissions as a starting point, immediately
 * editable via updateRolePermissionsAction.
 */
export async function createCustomRoleAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_roles")) return { error: "Not authorized." };

  const name = String(formData.get("name") ?? "").trim();
  const mapsTo = String(formData.get("mapsTo") ?? "") as UserRole;
  if (!name) return { error: "Role name is required." };
  if (!VALID_TIERS.includes(mapsTo)) return { error: "Pick a valid permission tier." };
  if (mapsTo === "owner") return { error: "A custom role can't map to Owner — there's always exactly one." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("roles").select("id").ilike("name", name).maybeSingle();
  if (existing) return { error: "A role with that name already exists." };

  const { data: role, error } = await admin
    .from("roles")
    .insert({ name, maps_to: mapsTo, is_system: false })
    .select("id")
    .single();
  if (error || !role) return { error: error?.message ?? "Could not create role." };

  const { data: startingTier } = await admin
    .from("roles")
    .select("id")
    .eq("is_system", true)
    .eq("maps_to", mapsTo)
    .maybeSingle();
  if (startingTier) {
    const { data: defaultPerms } = await admin
      .from("role_permissions")
      .select("permission_key")
      .eq("role_id", startingTier.id);
    if (defaultPerms && defaultPerms.length > 0) {
      await admin
        .from("role_permissions")
        .insert(defaultPerms.map((p) => ({ role_id: role.id, permission_key: p.permission_key })));
    }
  }

  revalidatePath("/team/admin");
  return undefined;
}

/** Requires manage_roles. System roles (Owner/Team Lead/Team Member/Parent) can't be deleted. */
export async function deleteCustomRoleAction(roleId: string) {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_roles")) throw new Error("Not authorized.");

  const admin = createAdminClient();
  const { data: role } = await admin.from("roles").select("is_system").eq("id", roleId).maybeSingle();
  if (role?.is_system) throw new Error("System roles can't be deleted.");

  await admin.from("roles").delete().eq("id", roleId);
  revalidatePath("/team/admin");
}

/**
 * Requires manage_roles. Replaces a role's full permission set in one shot
 * (the Roles panel's checkbox grid saves everything at once). The Owner
 * system role is locked out — it always has every permission, non-editable,
 * matching "there should always be exactly one Owner, with full access".
 */
export async function updateRolePermissionsAction(
  roleId: string,
  permissionKeys: string[],
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_roles")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: role } = await admin.from("roles").select("name, is_system, maps_to").eq("id", roleId).maybeSingle();
  if (!role) return { error: "That role no longer exists." };
  if (role.is_system && role.maps_to === "owner") {
    return { error: "The Owner role always has every permission and can't be edited." };
  }

  // Granting/revoking anything for a role that maps to Team Lead touches
  // the same "Owner/Team-Lead-tier access" boundary role changes do — keep
  // it Owner-only rather than letting a manage_roles-holder self-escalate.
  if (OWNER_GATED_TIERS.includes(role.maps_to) && profile!.role !== "owner") {
    return { error: "Only the Owner can edit a role that maps to Team Lead." };
  }

  const validKeys = permissionKeys.filter(isPermissionKey);

  await admin.from("role_permissions").delete().eq("role_id", roleId);
  if (validKeys.length > 0) {
    await admin
      .from("role_permissions")
      .insert(validKeys.map((key) => ({ role_id: roleId, permission_key: key })));
  }

  revalidatePath("/team/admin");
  return {};
}

/**
 * Requires manage_members. Assigns a member to any role (system or
 * custom) — sets both role_id (permissions) and role (the legacy tier
 * mirror, from the role's maps_to) together so they can never drift apart.
 */
export async function assignCustomRoleAction(
  userId: string,
  roleId: string,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_members")) return { error: "Not authorized." };
  if (profile!.id === userId) return { error: "You can't change your own role." };

  const admin = createAdminClient();

  const { data: role } = await admin.from("roles").select("id, maps_to").eq("id", roleId).maybeSingle();
  if (!role) return { error: "That role no longer exists." };

  const { data: target } = await admin.from("users").select("role").eq("id", userId).maybeSingle();
  if (!target) return { error: "Member not found." };

  const touchesOwnerGatedTier =
    OWNER_GATED_TIERS.includes(role.maps_to) || OWNER_GATED_TIERS.includes(target.role);
  if (touchesOwnerGatedTier && profile!.role !== "owner") {
    return { error: "Only the Owner can assign a role that grants Team Lead / Owner access." };
  }

  const { error } = await admin
    .from("users")
    .update({ role: role.maps_to, role_id: role.id })
    .eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/team/admin");
  return {};
}
