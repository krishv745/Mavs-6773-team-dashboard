"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { PLACEHOLDER_EMAIL_DOMAIN, USERNAME_PATTERN } from "@/lib/auth/constants";
import type { UserRole } from "@/lib/supabase/types";

/** Owner-only: the one action a Team Lead cannot perform. */
export async function deleteMemberAction(userId: string) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "owner") throw new Error("Only the Owner can delete accounts.");
  if (profile.id === userId) throw new Error("You can't delete your own account.");

  const admin = createAdminClient();
  // Deleting the auth user cascades to their public.users row; tasks/logs
  // they authored stick around with created_by/user_id set to null.
  await admin.auth.admin.deleteUser(userId);
  revalidatePath("/team/admin");
}

/**
 * Owner-only: removes a single clock_sessions row that's inflating (or
 * otherwise wrong in) a member's official hour totals — e.g. a forgotten
 * clock-out. Any task_logs pointing at the session are detached (kept, just
 * no longer tied to that session) rather than deleted, and a snapshot of
 * what was removed is kept in clock_session_deletions for audit purposes.
 */
export async function deleteClockSessionAction(sessionId: string) {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "delete_clock_sessions")) throw new Error("Not authorized to delete clock log entries.");

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("clock_sessions")
    .select("user_id, clock_in, clock_out")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return;

  await admin.from("clock_session_deletions").insert({
    user_id: session.user_id,
    clock_in: session.clock_in,
    clock_out: session.clock_out,
    deleted_by: profile!.id,
  });
  await admin.from("task_logs").update({ clock_session_id: null }).eq("clock_session_id", sessionId);
  await admin.from("clock_sessions").delete().eq("id", sessionId);

  revalidatePath("/team/admin");
  if (session.user_id) revalidatePath(`/team/admin/members/${session.user_id}`);
}

export async function addMemberAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_members")) return { error: "Not authorized." };

  const name = String(formData.get("name") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const starterPassword = String(formData.get("starterPassword") ?? "");
  const requestedRole = String(formData.get("role") ?? "member") as UserRole;

  if (!name || !username || starterPassword.length < 8) {
    return { error: "Fill in name, username, and an 8+ character starter password." };
  }

  const assignableRoles: UserRole[] =
    profile!.role === "owner" ? ["member", "parent", "team_lead"] : ["member", "parent"];
  if (!assignableRoles.includes(requestedRole)) {
    return { error: "Only the Owner can create a Team Lead account." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("username_lower", username.toLowerCase())
    .maybeSingle();
  if (existing) return { error: "That username is already taken." };

  const placeholderEmail = `${username.toLowerCase()}${PLACEHOLDER_EMAIL_DOMAIN}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: placeholderEmail,
    password: starterPassword,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return { error: createError?.message ?? "Could not create account." };
  }

  const { data: systemRole } = await admin
    .from("roles")
    .select("id")
    .eq("is_system", true)
    .eq("maps_to", requestedRole)
    .maybeSingle();

  const { error: insertError } = await admin.from("users").insert({
    id: created.user.id,
    name,
    username,
    role: requestedRole,
    role_id: systemRole?.id ?? null,
    must_reset_password: true,
  });
  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: insertError.message };
  }

  revalidatePath("/team/admin");
  return undefined;
}

/**
 * Staff-only. Passwords are hashed by Supabase Auth and can never be read
 * back — this sets a brand-new one the Team Lead types in, and forces the
 * member to confirm/change it on their next login.
 */
export async function setMemberPasswordAction(
  userId: string,
  newPassword: string,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_members")) return { error: "Not authorized." };
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters." };

  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (updateError) return { error: updateError.message };

  await admin.from("users").update({ must_reset_password: true }).eq("id", userId);

  revalidatePath("/team/admin");
  return {};
}

/** Staff-only. Edits a member's name, username, email, or phone from the Admin Dashboard. */
export async function updateMemberFieldAction(
  userId: string,
  field: "name" | "username" | "email" | "phone",
  value: string,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_members")) return { error: "Not authorized." };

  const trimmed = value.trim();
  // Phone is optional — everything else (name/username/email) still isn't.
  if (!trimmed && field !== "phone") return { error: "This can't be empty." };

  const admin = createAdminClient();

  if (field === "name") {
    const { error } = await admin.from("users").update({ name: trimmed }).eq("id", userId);
    if (error) return { error: error.message };
  } else if (field === "username") {
    if (!USERNAME_PATTERN.test(trimmed)) {
      return { error: "Letters, numbers, dots, and underscores only." };
    }
    const { data: existing } = await admin
      .from("users")
      .select("id")
      .eq("username_lower", trimmed.toLowerCase())
      .neq("id", userId)
      .maybeSingle();
    if (existing) return { error: "That username is already taken." };

    const { error } = await admin.from("users").update({ username: trimmed }).eq("id", userId);
    if (error) return { error: error.message };
  } else if (field === "phone") {
    const { error } = await admin.from("users").update({ phone: trimmed || null }).eq("id", userId);
    if (error) return { error: error.message };
  } else {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      email: trimmed,
      email_confirm: true,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/team/admin");
  return {};
}

// Role assignment (including base tiers, which are just system roles now)
// goes through assignCustomRoleAction in customRoles/actions.ts — every
// role, system or custom, is a row in the roles table.
