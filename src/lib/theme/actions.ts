"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth/session";
import type { ThemePreference } from "@/lib/supabase/types";

/**
 * Persists the signed-in member's light/dark/system choice to their account
 * row so it follows them to any device they sign in on. Called from
 * ThemeProvider on every toggle; the UI has already switched optimistically
 * either way, so this is fire-and-forget from the caller's perspective — it
 * just makes the choice stick for next time.
 */
export async function updateThemeAction(theme: ThemePreference) {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const admin = createAdminClient();
  await admin.from("users").update({ theme }).eq("id", profile.id);
}
