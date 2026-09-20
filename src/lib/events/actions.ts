"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import type { ActionState } from "@/lib/auth/actions";
import type { UserRole } from "@/lib/supabase/types";

type AdminClient = ReturnType<typeof createAdminClient>;

function weeklyDatesUntil(startDate: string, untilDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${untilDate}T00:00:00`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 7);
  }
  return dates;
}

/** Every later occurrence of the same recurring series as `eventId` (strictly after its date). Empty if the event isn't part of a series. */
async function futureSeriesEventIds(admin: AdminClient, eventId: string) {
  const { data: anchor } = await admin
    .from("events")
    .select("id, date, recurrence_group_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!anchor?.recurrence_group_id) return { anchor, futureIds: [] as string[] };

  const { data: future } = await admin
    .from("events")
    .select("id")
    .eq("recurrence_group_id", anchor.recurrence_group_id)
    .neq("id", eventId)
    .gt("date", anchor.date);
  return { anchor, futureIds: (future ?? []).map((e) => e.id) };
}

export async function createEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_events")) return { error: "Not authorized to add events." };

  const name = String(formData.get("name") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "") || null;
  const endTime = String(formData.get("endTime") ?? "") || null;
  const info = String(formData.get("info") ?? "").trim() || null;
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const repeatsWeekly = formData.get("repeatsWeekly") === "true";
  const repeatUntil = String(formData.get("repeatUntil") ?? "") || null;

  const visibleTo = formData.getAll("visibleTo").map((v) => String(v)) as UserRole[];

  const roleNames = formData.getAll("roleName").map((v) => String(v).trim());
  const roleSlots = formData.getAll("roleSlots").map((v) => Number(v) || 0);
  const roles = roleNames
    .map((roleName, i) => ({ name: roleName, slots_needed: roleSlots[i] ?? 0 }))
    .filter((r) => r.name.length > 0);

  if (!name || !date) {
    return { error: "Event name and date are required." };
  }
  if (repeatsWeekly && !repeatUntil) {
    return { error: "Pick an end date for the weekly repeat." };
  }

  const dates = repeatsWeekly && repeatUntil ? weeklyDatesUntil(date, repeatUntil) : [date];
  if (dates.length > 52) {
    return { error: "That's more than a year of weekly occurrences — pick a closer end date." };
  }

  const admin = createAdminClient();
  const recurrenceGroupId = dates.length > 1 ? crypto.randomUUID() : null;

  const { data: events, error } = await admin
    .from("events")
    .insert(
      dates.map((d) => ({
        name,
        date: d,
        start_time: startTime,
        end_time: endTime,
        info,
        category_id: categoryId,
        visible_to: visibleTo.length > 0 ? visibleTo : null,
        recurrence_group_id: recurrenceGroupId,
        created_by: profile!.id,
      })),
    )
    .select("id");
  if (error || !events) return { error: error?.message ?? "Could not create event. Try again." };

  if (roles.length > 0) {
    const { error: rolesError } = await admin.from("event_roles").insert(
      events.flatMap((event) => roles.map((r) => ({ ...r, event_id: event.id }))),
    );
    if (rolesError) {
      return { error: `Event created, but roles couldn't be saved: ${rolesError.message}` };
    }
  }

  revalidatePath("/team/events");
  redirect("/team/events");
}

/** Staff-only. Editing a single occurrence updates only that row; editing "this and future" propagates the shared fields (not the date) and matching-named role slot counts to every later occurrence in the series. */
export async function updateEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_events")) return { error: "Not authorized to edit events." };

  const eventId = String(formData.get("eventId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "") || null;
  const endTime = String(formData.get("endTime") ?? "") || null;
  const info = String(formData.get("info") ?? "").trim() || null;
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const scope = String(formData.get("scope") ?? "this") === "series" ? "series" : "this";
  const visibleTo = formData.getAll("visibleTo").map((v) => String(v)) as UserRole[];

  const roleIds = formData.getAll("roleId").map((v) => String(v));
  const roleSlots = formData.getAll("roleSlots").map((v) => Number(v) || 0);

  if (!eventId || !name) return { error: "Event name is required." };
  if (scope === "this" && !date) return { error: "Event date is required." };

  const admin = createAdminClient();

  const sharedFields = {
    name,
    start_time: startTime,
    end_time: endTime,
    info,
    category_id: categoryId,
    visible_to: visibleTo.length > 0 ? visibleTo : null,
  };

  if (scope === "series") {
    const { futureIds } = await futureSeriesEventIds(admin, eventId);
    const targetIds = [eventId, ...futureIds];
    const { error } = await admin.from("events").update(sharedFields).in("id", targetIds);
    if (error) return { error: error.message };

    if (futureIds.length > 0 && roleIds.length > 0) {
      const { data: anchorRoles } = await admin.from("event_roles").select("id, name").in("id", roleIds);
      const nameById = new Map((anchorRoles ?? []).map((r) => [r.id, r.name]));

      const { data: futureRoles } = await admin
        .from("event_roles")
        .select("id, event_id, name")
        .in("event_id", futureIds);

      for (let i = 0; i < roleIds.length; i++) {
        const roleName = nameById.get(roleIds[i]);
        const newSlots = roleSlots[i] ?? 0;
        if (!roleName) continue;
        const matchIds = (futureRoles ?? []).filter((r) => r.name === roleName).map((r) => r.id);
        if (matchIds.length > 0) {
          await admin.from("event_roles").update({ slots_needed: newSlots }).in("id", matchIds);
        }
      }
    }
  } else {
    const { error } = await admin.from("events").update({ ...sharedFields, date }).eq("id", eventId);
    if (error) return { error: error.message };
  }

  for (let i = 0; i < roleIds.length; i++) {
    await admin.from("event_roles").update({ slots_needed: roleSlots[i] ?? 0 }).eq("id", roleIds[i]);
  }

  revalidatePath("/team/events");
  revalidatePath(`/team/events/${eventId}`);
  redirect(`/team/events/${eventId}`);
}

/** Staff-only, hard delete — event_roles and event_volunteers cascade automatically. Deletes only this occurrence, not the rest of a recurring series. */
export async function deleteEventAction(eventId: string) {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "delete_events")) throw new Error("Not authorized.");

  const admin = createAdminClient();
  await admin.from("events").delete().eq("id", eventId);

  revalidatePath("/team/events");
  redirect("/team/events");
}

export async function createEventCategoryAction(
  name: string,
): Promise<{ id?: string; name?: string; error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_events")) return { error: "Not authorized." };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Category name is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("event_categories")
    .insert({ name: trimmed })
    .select("id, name")
    .single();
  if (error || !data) return { error: "That category may already exist." };

  revalidatePath("/team/events");
  return { id: data.id, name: data.name };
}

/** Self-signup. Name/email are always the signed-in member's own — never taken from the form. */
export async function volunteerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const eventId = String(formData.get("eventId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const applyToSeries = formData.get("applyToSeries") === "true";

  if (!eventId || !roleId) return { error: "Pick a role to sign up for." };

  const profile = await getCurrentProfile();
  if (!profile) return { error: "Your session expired. Log in again." };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Could not find your account email." };

  const admin = createAdminClient();
  const { data: role } = await admin.from("event_roles").select("id, name").eq("id", roleId).maybeSingle();
  if (!role) return { error: "That role no longer exists." };

  const targets: { eventId: string; roleId: string }[] = [{ eventId, roleId }];
  if (applyToSeries) {
    const { futureIds } = await futureSeriesEventIds(admin, eventId);
    if (futureIds.length > 0) {
      const { data: futureRoles } = await admin
        .from("event_roles")
        .select("id, event_id")
        .in("event_id", futureIds)
        .eq("name", role.name);
      for (const r of futureRoles ?? []) targets.push({ eventId: r.event_id, roleId: r.id });
    }
  }

  const { error } = await admin.from("event_volunteers").insert(
    targets.map((t) => ({
      event_id: t.eventId,
      name: profile.name,
      email: user.email!,
      notes,
      role_id: t.roleId,
      user_id: profile.id,
    })),
  );
  if (error) return { error: error.message || "Could not register. Try again." };

  revalidatePath(`/team/events/${eventId}`);
  redirect(`/team/events/${eventId}`);
}

/** Self-cancel (owner of the signup) or staff cancelling on someone's behalf — either way a reason is required and the row is kept (soft-cancelled) so it stays auditable in the admin dashboard. */
export async function cancelVolunteerRegistrationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const volunteerId = String(formData.get("volunteerId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!volunteerId) return { error: "Missing registration." };
  if (!reason) return { error: "Please tell us why you're cancelling." };

  const profile = await getCurrentProfile();
  if (!profile) return { error: "Your session expired. Log in again." };

  const admin = createAdminClient();
  const { data: volunteer } = await admin
    .from("event_volunteers")
    .select("id, event_id, user_id, status")
    .eq("id", volunteerId)
    .maybeSingle();
  if (!volunteer) return { error: "Registration not found." };
  if (volunteer.status === "cancelled") return { error: "That registration is already cancelled." };

  const ownedByCaller = volunteer.user_id === profile.id;
  if (!ownedByCaller && !hasPermission(profile, "manage_events")) {
    return { error: "You can only cancel your own registration." };
  }

  const { error } = await admin
    .from("event_volunteers")
    .update({ status: "cancelled", cancel_reason: reason, cancelled_at: new Date().toISOString() })
    .eq("id", volunteerId);
  if (error) return { error: error.message };

  revalidatePath(`/team/events/${volunteer.event_id}`);
  revalidatePath("/team/admin");
  redirect(`/team/events/${volunteer.event_id}`);
}

/** Staff-only: reassign an existing sign-up to a different role. */
export async function staffUpdateVolunteerRoleAction(
  volunteerId: string,
  roleId: string,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_events")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: volunteer } = await admin
    .from("event_volunteers")
    .select("event_id")
    .eq("id", volunteerId)
    .maybeSingle();
  if (!volunteer) return { error: "Registration not found." };

  const { error } = await admin
    .from("event_volunteers")
    .update({ role_id: roleId })
    .eq("id", volunteerId);
  if (error) return { error: error.message };

  revalidatePath(`/team/events/${volunteer.event_id}`);
  return {};
}

/** Staff-only: check off any number of members/parents to assign them all to one role in a single action (plus an optional one-off walk-in without an account). */
export async function staffAssignVolunteerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_events")) return { error: "Not authorized." };

  const eventId = String(formData.get("eventId") ?? "");
  const roleId = String(formData.get("roleId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const applyToSeries = formData.get("applyToSeries") === "true";
  const userIds = [...new Set(formData.getAll("userIds").map((v) => String(v)).filter(Boolean))];
  const walkInName = String(formData.get("walkInName") ?? "").trim();
  const walkInEmail = String(formData.get("walkInEmail") ?? "").trim();

  if (!eventId || !roleId) return { error: "Pick a role." };
  if (userIds.length === 0 && !(walkInName && walkInEmail)) {
    return { error: "Check at least one person, or add a name and email for a walk-in." };
  }

  const admin = createAdminClient();
  const { data: role } = await admin.from("event_roles").select("id, name").eq("id", roleId).maybeSingle();
  if (!role) return { error: "That role no longer exists." };

  const targetsByEvent: { eventId: string; roleId: string }[] = [{ eventId, roleId }];
  if (applyToSeries) {
    const { futureIds } = await futureSeriesEventIds(admin, eventId);
    if (futureIds.length > 0) {
      const { data: futureRoles } = await admin
        .from("event_roles")
        .select("id, event_id")
        .in("event_id", futureIds)
        .eq("name", role.name);
      for (const r of futureRoles ?? []) targetsByEvent.push({ eventId: r.event_id, roleId: r.id });
    }
  }

  let members: { id: string; name: string }[] = [];
  if (userIds.length > 0) {
    const { data } = await admin.from("users").select("id, name").in("id", userIds);
    members = data ?? [];
  }

  const emailByUserId = new Map<string, string>();
  for (const id of userIds) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data.user?.email) emailByUserId.set(id, data.user.email);
  }

  const rows: { event_id: string; role_id: string; name: string; email: string; notes: string | null; user_id: string | null }[] = [];
  for (const target of targetsByEvent) {
    for (const member of members) {
      const email = emailByUserId.get(member.id);
      if (!email) continue;
      rows.push({ event_id: target.eventId, role_id: target.roleId, name: member.name, email, notes, user_id: member.id });
    }
    if (walkInName && walkInEmail) {
      rows.push({ event_id: target.eventId, role_id: target.roleId, name: walkInName, email: walkInEmail, notes, user_id: null });
    }
  }
  if (rows.length === 0) return { error: "Could not resolve anyone to assign." };

  const { error } = await admin.from("event_volunteers").insert(rows);
  if (error) return { error: error.message || "Could not assign. Try again." };

  revalidatePath(`/team/events/${eventId}`);
  redirect(`/team/events/${eventId}`);
}
