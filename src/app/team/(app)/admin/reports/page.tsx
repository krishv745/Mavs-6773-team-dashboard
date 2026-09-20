import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { sessionMinutes } from "@/lib/hours";
import { formatClockDateTime, formatShortDate } from "@/lib/formatTime";
import { isVideoUrl } from "@/lib/media";
import SummarizeReportButton from "@/components/team/SummarizeReportButton";

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; person?: string | string[]; filtered?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "view_admin_hours")) redirect("/team/projects");

  const params = await searchParams;
  const defaults = defaultRange();
  const start = params.start || defaults.start;
  const end = params.end || defaults.end;

  const rangeStartIso = `${start}T00:00:00.000Z`;
  const rangeEndExclusive = new Date(`${end}T00:00:00.000Z`);
  rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1);
  const rangeEndIso = rangeEndExclusive.toISOString();

  // Only trust `person` as an explicit filter once the form has actually been
  // submitted (marked by `filtered=1`) — otherwise an all-unchecked submit and
  // a fresh page load are indistinguishable, and a fresh load should show everyone.
  const isFiltered = params.filtered === "1";
  const selectedPersonIds = isFiltered
    ? (Array.isArray(params.person) ? params.person : params.person ? [params.person] : [])
    : [];

  const supabase = await createServerClient();

  let sessionsQuery = supabase
    .from("clock_sessions")
    .select("user_id, clock_in, clock_out")
    .gte("clock_in", rangeStartIso)
    .lt("clock_in", rangeEndIso);
  let logsQuery = supabase
    .from("task_logs")
    .select("id, task_id, user_id, timestamp, description, photo_url, photo_urls, audio_transcript")
    .gte("timestamp", rangeStartIso)
    .lt("timestamp", rangeEndIso)
    .order("timestamp", { ascending: false });
  if (isFiltered) {
    sessionsQuery = sessionsQuery.in("user_id", selectedPersonIds.length ? selectedPersonIds : [""]);
    logsQuery = logsQuery.in("user_id", selectedPersonIds.length ? selectedPersonIds : [""]);
  }

  const [{ data: sessions }, { data: logs }, { data: users }] = await Promise.all([
    sessionsQuery,
    logsQuery,
    supabase.from("users").select("id, name").order("name", { ascending: true }),
  ]);

  const userName = new Map((users ?? []).map((u) => [u.id, u.name]));

  const taskIds = [...new Set((logs ?? []).map((l) => l.task_id).filter((id): id is string => Boolean(id)))];
  const { data: tasks } = taskIds.length
    ? await supabase.from("tasks").select("id, title").in("id", taskIds)
    : { data: [] };
  const taskTitle = new Map((tasks ?? []).map((t) => [t.id, t.title]));

  // eslint-disable-next-line react-hooks/purity -- server-rendered timestamp for open sessions, not memoized
  const now = Date.now();
  const minutesByUser = new Map<string, number>();
  for (const s of sessions ?? []) {
    minutesByUser.set(s.user_id, (minutesByUser.get(s.user_id) ?? 0) + sessionMinutes(s.clock_in, s.clock_out, now));
  }
  const hourRows = [...minutesByUser.entries()]
    .map(([userId, minutes]) => ({ userId, name: userName.get(userId) ?? "A member", hours: minutes / 60 }))
    .sort((a, b) => b.hours - a.hours);

  const photos = (logs ?? []).flatMap((l) => {
    const urls = l.photo_urls.length > 0 ? l.photo_urls : l.photo_url ? [l.photo_url] : [];
    return urls.map((url) => ({ url, log: l }));
  });

  return (
    <div>
      <Link href="/team/admin" className="text-sm font-medium text-ink/50 hover:text-ink">
        ← Back to Admin Dashboard
      </Link>

      <h1 className="font-display mt-3 text-2xl font-bold text-ink">Activity Report</h1>
      <p className="mt-1 text-sm text-ink/60">
        Everything logged, and hours worked, in a date range.
      </p>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="GET">
        <div>
          <label htmlFor="start" className="text-xs font-medium text-ink/60">
            From
          </label>
          <input
            id="start"
            name="start"
            type="date"
            defaultValue={start}
            className="mt-1 block rounded-md border border-hairline-strong px-3 py-2 text-sm outline-none focus:border-navy"
          />
        </div>
        <div>
          <label htmlFor="end" className="text-xs font-medium text-ink/60">
            To
          </label>
          <input
            id="end"
            name="end"
            type="date"
            defaultValue={end}
            className="mt-1 block rounded-md border border-hairline-strong px-3 py-2 text-sm outline-none focus:border-navy"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy/90"
        >
          Apply
        </button>

        <input type="hidden" name="filtered" value="1" />
        <fieldset className="w-full">
          <legend className="text-xs font-medium text-ink/60">People (uncheck to exclude)</legend>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {(users ?? []).map((u) => (
              <label key={u.id} className="flex items-center gap-1.5 text-sm text-ink/70">
                <input
                  type="checkbox"
                  name="person"
                  value={u.id}
                  defaultChecked={!isFiltered || selectedPersonIds.includes(u.id)}
                  className="rounded border-hairline-strongest"
                />
                {u.name}
              </label>
            ))}
          </div>
        </fieldset>
      </form>

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink/40">
          Hours by person
        </h2>
        {hourRows.length === 0 ? (
          <p className="mt-3 text-sm text-ink/50">No clocked hours in this range.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-hairline bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-hairline bg-tint/60 text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-4 py-3 font-semibold">Member</th>
                  <th className="px-4 py-3 font-semibold">Hours</th>
                </tr>
              </thead>
              <tbody>
                {hourRows.map((row) => (
                  <tr key={row.userId} className="border-b border-hairline last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                    <td className="px-4 py-3 text-ink/70">{row.hours.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <SummarizeReportButton
          start={start}
          end={end}
          personIds={isFiltered ? (selectedPersonIds.length ? selectedPersonIds : ["__none__"]) : []}
        />
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink/40">
          All logs ({(logs ?? []).length})
        </h2>
        {(logs ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink/50">Nothing logged in this range.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(logs ?? []).map((log) => (
              <li key={log.id} className="rounded-xl border border-hairline bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{userName.get(log.user_id ?? "") ?? "A member"}</p>
                  <p className="text-xs text-ink/40">{formatClockDateTime(log.timestamp)}</p>
                </div>
                <p className="mt-1 text-xs text-ink/50">
                  {log.task_id ? (taskTitle.get(log.task_id) ?? "a task") : "General update"}
                </p>
                {log.description && <p className="mt-2 text-sm text-ink/70">{log.description}</p>}
                {log.audio_transcript && (
                  <p className="mt-2 text-sm text-ink/70">🎤 {log.audio_transcript}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {photos.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-ink/40">
            Photo &amp; video gallery ({photos.length})
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map(({ url, log }, i) => (
              <figure key={`${log.id}-${i}`} className="overflow-hidden rounded-lg border border-hairline bg-surface">
                {isVideoUrl(url) ? (
                  <video src={url} controls className="aspect-square w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage image, no next/image config needed
                  <img src={url} alt="" className="aspect-square w-full object-cover" />
                )}
                <figcaption className="px-2 py-1.5 text-[11px] text-ink/50">
                  {formatShortDate(log.timestamp)}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
