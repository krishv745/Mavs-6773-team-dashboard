import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Silently closes every still-open clock session. Triggered by the Vercel
 * Cron schedule in vercel.json, fixed to 06:00 UTC — midnight CST,
 * year-round (not adjusted for CDT, per how the team tracks hours).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error, count } = await admin
    .from("clock_sessions")
    .update({ clock_out: new Date().toISOString(), auto_clocked_out: true }, { count: "exact" })
    .is("clock_out", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ clockedOut: count ?? 0 });
}
