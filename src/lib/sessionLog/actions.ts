"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth/session";
import { getOpenSession, clockOut, clockIn } from "@/lib/clock";

export type SessionLogState = { error?: string; success?: boolean } | undefined;

/**
 * A status update tied only to the current clock session, not any task —
 * shows up in the Clock Log, never on a task's History.
 */
export async function addSessionLogAction(
  _prev: SessionLogState,
  formData: FormData,
): Promise<SessionLogState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const description = String(formData.get("description") ?? "").trim() || null;
  // Photos/videos upload straight from the browser to Supabase Storage (see
  // NoteFields) — this just receives the resulting public URLs as plain
  // text, never the file bodies themselves.
  const photoUrls = formData.getAll("photo").map((v) => String(v)).filter(Boolean);
  const thenClockOut = formData.get("thenClockOut") === "true";

  if (!description && photoUrls.length === 0) {
    return { error: "Add a note or a photo before submitting." };
  }

  const openSession = await getOpenSession(profile.id);
  if (!openSession) return { error: "You're not clocked in right now." };

  const admin = createAdminClient();

  const { error } = await admin.from("task_logs").insert({
    task_id: null,
    user_id: profile.id,
    clock_session_id: openSession.id,
    description,
    photo_url: photoUrls[0] ?? null,
    photo_urls: photoUrls,
  });
  if (error) return { error: error.message };

  revalidatePath("/team/log");

  if (thenClockOut) {
    await clockOut(profile.id);
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    redirect("/team/login");
  }

  return { success: true };
}

/**
 * Answers the "what did you work on last time?" prompt shown when the
 * previous session was force-closed by the nightly cron (tab closed without
 * clocking out) — the log attaches to that past session, not a new one.
 * Resolving this prompt doesn't happen through the normal login flow (the
 * browser is often still authenticated from before), so it has to clock the
 * member back in itself — otherwise they land back on /team/projects not
 * actually clocked in for today.
 */
export async function submitCatchUpLogAction(
  _prev: SessionLogState,
  formData: FormData,
): Promise<SessionLogState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const sessionId = String(formData.get("sessionId") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;
  // Photos/videos upload straight from the browser to Supabase Storage (see
  // NoteFields) — this just receives the resulting public URLs as plain
  // text, never the file bodies themselves.
  const photoUrls = formData.getAll("photo").map((v) => String(v)).filter(Boolean);

  if (!sessionId) redirect("/team/projects");
  if (!description && photoUrls.length === 0) {
    return { error: "Add a note or a photo, or skip instead." };
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("clock_sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.user_id !== profile.id) return { error: "Session not found." };

  await admin.from("task_logs").insert({
    task_id: null,
    user_id: profile.id,
    clock_session_id: sessionId,
    description,
    photo_url: photoUrls[0] ?? null,
    photo_urls: photoUrls,
  });
  await admin.from("clock_sessions").update({ catch_up_resolved: true }).eq("id", sessionId);
  await clockIn(profile.id);

  redirect("/team/projects");
}

export async function skipCatchUpLogAction(formData: FormData) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/team/login");

  const sessionId = String(formData.get("sessionId") ?? "");
  if (sessionId) {
    const admin = createAdminClient();
    await admin
      .from("clock_sessions")
      .update({ catch_up_resolved: true })
      .eq("id", sessionId)
      .eq("user_id", profile.id);
  }

  await clockIn(profile.id);
  redirect("/team/projects");
}
