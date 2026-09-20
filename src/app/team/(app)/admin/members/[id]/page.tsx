import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { roleLabel } from "@/lib/roles";
import { WEEKLY_MINIMUM_MINUTES, startOfWeek, sessionMinutes } from "@/lib/hours";
import { formatClockDateTime } from "@/lib/formatTime";
import DeleteClockSessionButton from "@/components/team/DeleteClockSessionButton";

const WEEKS_OF_HISTORY = 12;
const RECENT_SESSIONS_LIMIT = 30;

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export default async function MemberHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "view_admin_hours")) redirect("/team/projects");

  const supabase = await createServerClient();
  const { data: member } = await supabase.from("users").select("*").eq("id", id).single();
  if (!member) notFound();

  const { data: customRole } = member.role_id
    ? await supabase.from("roles").select("name").eq("id", member.role_id).maybeSingle()
    : { data: null };

  const now = new Date();
  const earliestWeekStart = startOfWeek(now);
  earliestWeekStart.setDate(earliestWeekStart.getDate() - 7 * (WEEKS_OF_HISTORY - 1));

  const { data: sessions } = await supabase
    .from("clock_sessions")
    .select("id, clock_in, clock_out")
    .eq("user_id", id)
    .gte("clock_in", earliestWeekStart.toISOString())
    .order("clock_in", { ascending: true });

  const weeks: { start: Date; minutes: number }[] = Array.from({ length: WEEKS_OF_HISTORY }, (_, i) => {
    const start = startOfWeek(now);
    start.setDate(start.getDate() - 7 * (WEEKS_OF_HISTORY - 1 - i));
    return { start, minutes: 0 };
  });

  for (const s of sessions ?? []) {
    const clockInTime = new Date(s.clock_in).getTime();
    const week = weeks.find((w, i) => {
      const nextStart = weeks[i + 1]?.start.getTime() ?? Infinity;
      return clockInTime >= w.start.getTime() && clockInTime < nextStart;
    });
    if (week) week.minutes += sessionMinutes(s.clock_in, s.clock_out, now.getTime());
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/team/admin" className="text-sm font-medium text-ink/50 hover:text-ink">
        ← Back to Admin Dashboard
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">{member.name}</h1>
          <p className="mt-1 text-sm text-ink/50">{customRole?.name ?? roleLabel(member.role)}</p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-hairline bg-tint/60 text-xs uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-4 py-3 font-semibold">Week of</th>
              <th className="px-4 py-3 font-semibold">Hours</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {[...weeks].reverse().map((w) => {
              const hours = (w.minutes / 60).toFixed(1);
              const isCurrent = w.start.getTime() === startOfWeek(now).getTime();
              const flagged = w.minutes < WEEKLY_MINIMUM_MINUTES;
              return (
                <tr key={w.start.toISOString()} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-3 text-ink">
                    {w.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {isCurrent && <span className="ml-2 text-xs text-ink/40">(this week)</span>}
                  </td>
                  <td className="px-4 py-3 text-ink/70">{hours}h</td>
                  <td className="px-4 py-3">
                    {flagged ? (
                      <span className="rounded-full bg-crimson/10 px-2.5 py-1 text-xs font-semibold text-crimson">
                        Under 6h
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                        On track
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 font-display text-lg font-bold text-ink">Recent sessions</h2>
      <p className="mt-1 text-xs text-ink/50">
        {hasPermission(profile, "delete_clock_sessions")
          ? "Delete a bad entry (e.g. a forgotten clock-out) to correct their hour totals."
          : "You don't have permission to delete a session entry."}
      </p>
      <div className="mt-3 space-y-2">
        {(sessions ?? []).length === 0 && <p className="text-sm text-ink/40">No sessions in this window.</p>}
        {[...(sessions ?? [])]
          .reverse()
          .slice(0, RECENT_SESSIONS_LIMIT)
          .map((s) => {
            const minutes = sessionMinutes(s.clock_in, s.clock_out, now.getTime());
            const durationLabel = formatDuration(minutes);
            const dateLabel = formatClockDateTime(s.clock_in);
            return (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-2.5 text-sm"
              >
                <div>
                  <p className="text-ink">{dateLabel}</p>
                  <p className="text-xs text-ink/50">
                    {durationLabel}
                    {!s.clock_out && " · still clocked in"}
                  </p>
                </div>
                {hasPermission(profile, "delete_clock_sessions") && (
                  <DeleteClockSessionButton sessionId={s.id} dateLabel={dateLabel} durationLabel={durationLabel} />
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
