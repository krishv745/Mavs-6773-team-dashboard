import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { formatClockTime, formatLongDate } from "@/lib/formatTime";
import CatchUpLogForm from "@/components/team/CatchUpLogForm";

export default async function CatchUpLogPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/team/login");

  const supabase = await createServerClient();
  const { data: session } = await supabase
    .from("clock_sessions")
    .select("id, clock_in")
    .eq("user_id", profile.id)
    .eq("auto_clocked_out", true)
    .eq("catch_up_resolved", false)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) redirect("/team/projects");

  const clockInDate = formatLongDate(session.clock_in);
  const clockInTime = formatClockTime(session.clock_in);

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-ink">One more thing</h1>
      <p className="mt-1 text-sm text-ink/60">
        Looks like you closed the tab without clocking out on <span className="font-semibold text-ink">{clockInDate}</span>{" "}
        (clocked in at {clockInTime}) — what did you work on?
      </p>

      <CatchUpLogForm sessionId={session.id} />
    </>
  );
}
