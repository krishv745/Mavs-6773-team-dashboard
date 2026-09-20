import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getOpenSession(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("clock_sessions")
    .select("id, clock_in")
    .eq("user_id", userId)
    .is("clock_out", null)
    .maybeSingle();
  return data;
}

export async function clockIn(userId: string) {
  const admin = createAdminClient();

  const { data: profile } = await admin.from("users").select("role").eq("id", userId).single();
  if (profile?.role === "parent") return null;

  const open = await getOpenSession(userId);
  if (open) return open.id;

  const { data, error } = await admin
    .from("clock_sessions")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function clockOut(userId: string) {
  const admin = createAdminClient();
  await admin
    .from("clock_sessions")
    .update({ clock_out: new Date().toISOString() })
    .eq("user_id", userId)
    .is("clock_out", null);
}
