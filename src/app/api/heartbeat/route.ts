import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Pinged every ~60s by ClockHeartbeat while a tab is open, regardless of
 * whether it's the active/visible tab — keeps clock_sessions.last_seen_at
 * fresh so middleware can tell "still open, just idle or backgrounded"
 * apart from "actually closed" (no more pings at all) before deciding to
 * auto clock someone out. Outside /team, so middleware's own checks don't
 * run on these requests.
 */
export async function POST() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  await admin
    .from("clock_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("clock_out", null);

  return NextResponse.json({ ok: true });
}
