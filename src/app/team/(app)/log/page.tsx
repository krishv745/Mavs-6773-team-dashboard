import Link from "next/link";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { formatClockDateTime } from "@/lib/formatTime";
import { isVideoUrl } from "@/lib/media";
import IndividualLogPicker from "@/components/team/IndividualLogPicker";
import DeleteClockSessionButton from "@/components/team/DeleteClockSessionButton";

type SessionLogEntry = {
  id: string;
  timestamp: string;
  taskTitle: string | null;
  description: string | null;
  photoUrls: string[];
};

function formatDuration(startIso: string, endIso: string | null, now: number) {
  const end = endIso ? new Date(endIso).getTime() : now;
  const minutes = Math.max(0, Math.round((end - new Date(startIso).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export default async function ClockLogPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; person?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "team" ? "team" : params.view === "individual" ? "individual" : "mine";

  const [profile, supabase] = await Promise.all([getCurrentProfile(), createServerClient()]);
  if (!profile) return null;

  const { data: allUsers } = await supabase.from("users").select("id, name").order("name", { ascending: true });

  const individualPersonId = view === "individual" ? (params.person ?? "") : "";
  const skipQuery = view === "individual" && !individualPersonId;

  let sessionsQuery = supabase
    .from("clock_sessions")
    .select("*")
    .order("clock_in", { ascending: false });
  if (view === "mine") sessionsQuery = sessionsQuery.eq("user_id", profile.id);
  if (view === "individual") sessionsQuery = sessionsQuery.eq("user_id", individualPersonId);

  const { data: sessions } = skipQuery ? { data: [] } : await sessionsQuery.limit(200);
  const sessionIds = (sessions ?? []).map((s) => s.id);

  const { data: logs } = sessionIds.length
    ? await supabase
        .from("task_logs")
        .select("id, task_id, task_title, clock_session_id, description, photo_url, photo_urls, timestamp")
        .in("clock_session_id", sessionIds)
        .order("timestamp", { ascending: true })
    : { data: [] };

  const taskIds = [...new Set((logs ?? []).map((l) => l.task_id).filter((id): id is string => Boolean(id)))];
  const { data: tasks } = taskIds.length
    ? await supabase.from("tasks").select("id, title").in("id", taskIds)
    : { data: [] };
  const taskTitle = new Map((tasks ?? []).map((t) => [t.id, t.title]));

  // Every log entry shows in full — description and photos/videos both —
  // regardless of whether it's tied to a task; it used to only show the
  // task's name (or, for a plain session note, just the text) and silently
  // dropped the description and every photo for any log tied to a task.
  const entriesBySession = new Map<string, SessionLogEntry[]>();
  for (const log of logs ?? []) {
    if (!log.clock_session_id) continue;
    // A log whose task was deleted keeps its snapshot name (task_title).
    const rawTitle = log.task_id ? taskTitle.get(log.task_id) ?? "a task" : log.task_title;
    const taskTitleLabel = rawTitle ? (log.task_id ? rawTitle : `${rawTitle} (deleted)`) : null;
    const photoUrls = log.photo_urls?.length ? log.photo_urls : log.photo_url ? [log.photo_url] : [];
    const list = entriesBySession.get(log.clock_session_id) ?? [];
    list.push({
      id: log.id,
      timestamp: log.timestamp,
      taskTitle: taskTitleLabel,
      description: log.description,
      photoUrls,
    });
    entriesBySession.set(log.clock_session_id, list);
  }

  const userName = new Map((allUsers ?? []).map((u) => [u.id, u.name]));

  // eslint-disable-next-line react-hooks/purity -- server-rendered "now" for open sessions, not memoized
  const now = Date.now();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-ink">Clock Log</h1>
        <div className="flex rounded-md border border-hairline-strong bg-surface p-0.5">
          <Link
            href="/team/log"
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${
              view === "mine" ? "bg-navy text-white" : "text-ink/60"
            }`}
          >
            My log
          </Link>
          <Link
            href="/team/log?view=team"
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${
              view === "team" ? "bg-navy text-white" : "text-ink/60"
            }`}
          >
            Team log
          </Link>
          <Link
            href="/team/log?view=individual"
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${
              view === "individual" ? "bg-navy text-white" : "text-ink/60"
            }`}
          >
            Individual log
          </Link>
        </div>
      </div>

      {view === "individual" && (
        <IndividualLogPicker users={allUsers ?? []} selectedId={individualPersonId} />
      )}

      {view === "individual" && !individualPersonId ? (
        <p className="mt-6 text-sm text-ink/50">Pick a member above to see their log.</p>
      ) : (sessions ?? []).length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-hairline-strong bg-surface/60 p-10 text-center text-sm text-ink/50">
          Nothing logged yet.
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {(sessions ?? []).map((session) => {
            const entries = entriesBySession.get(session.id) ?? [];
            const dateLabel = formatClockDateTime(session.clock_in);
            const durationLabel = formatDuration(session.clock_in, session.clock_out, now);
            return (
              <li key={session.id} className="rounded-xl border border-hairline bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    {view === "team" && (
                      <p className="text-sm font-semibold text-ink">
                        {userName.get(session.user_id) ?? "A member"}
                      </p>
                    )}
                    <p className="text-xs text-ink/50">
                      {dateLabel}
                      {session.clock_out ? "" : " · still clocked in"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-navy/10 px-2.5 py-1 text-xs font-semibold text-navy">
                      {durationLabel}
                    </span>
                    {hasPermission(profile, "delete_clock_sessions") && (
                      <DeleteClockSessionButton sessionId={session.id} dateLabel={dateLabel} durationLabel={durationLabel} />
                    )}
                  </div>
                </div>
                {entries.length > 0 && (
                  <ul className="mt-3 space-y-2 border-t border-hairline pt-3">
                    {entries.map((entry) => (
                      <li key={entry.id} className="rounded-lg border border-hairline bg-tint/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          {entry.taskTitle && (
                            <span className="text-xs font-semibold text-navy">📌 {entry.taskTitle}</span>
                          )}
                          <span className="text-[11px] text-ink/40">{formatClockDateTime(entry.timestamp)}</span>
                        </div>
                        {entry.description && (
                          <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink/70">{entry.description}</p>
                        )}
                        {entry.photoUrls.length > 0 && (
                          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {entry.photoUrls.map((url, i) =>
                              isVideoUrl(url) ? (
                                <video
                                  key={url}
                                  src={url}
                                  controls
                                  className="aspect-square w-full rounded-lg border border-hairline object-cover"
                                />
                              ) : (
                                <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage image, no next/image config needed */}
                                  <img
                                    src={url}
                                    alt={`Log photo ${i + 1}`}
                                    className="aspect-square w-full rounded-lg border border-hairline object-cover"
                                  />
                                </a>
                              ),
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
