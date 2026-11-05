import Link from "next/link";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { formatClockDateTime } from "@/lib/formatTime";
import { isVideoUrl } from "@/lib/media";
import IndividualLogPicker from "@/components/team/IndividualLogPicker";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; person?: string }>;
}) {
  const params = await searchParams;
  const view =
    params.view === "team"
      ? "team"
      : params.view === "individual"
        ? "individual"
        : "mine";

  const [profile, supabase] = await Promise.all([
    getCurrentProfile(),
    createServerClient(),
  ]);
  if (!profile) return null;

  const { data: allUsers } = await supabase
    .from("users")
    .select("id, name")
    .order("name", { ascending: true });

  const individualPersonId = view === "individual" ? (params.person ?? "") : "";
  const skipQuery = view === "individual" && !individualPersonId;

  let logsQuery = supabase
    .from("task_logs")
    .select(
      "id, task_id, task_title, user_id, description, photo_url, photo_urls, timestamp",
    )
    .or("task_id.not.is.null,task_title.not.is.null")
    .order("timestamp", { ascending: false });
  if (view === "mine") logsQuery = logsQuery.eq("user_id", profile.id);
  if (view === "individual")
    logsQuery = logsQuery.eq("user_id", individualPersonId);

  const { data: logs } = skipQuery ? { data: [] } : await logsQuery.limit(200);

  const taskIds = [
    ...new Set(
      (logs ?? [])
        .map((l) => l.task_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: tasks } = taskIds.length
    ? await supabase.from("tasks").select("id, title").in("id", taskIds)
    : { data: [] };
  const taskTitle = new Map((tasks ?? []).map((t) => [t.id, t.title]));

  const entries = (logs ?? []).map((log) => {
    // A log whose task was deleted keeps its snapshot name (task_title).
    const rawTitle = log.task_id
      ? (taskTitle.get(log.task_id) ?? "a task")
      : log.task_title;
    return {
      id: log.id,
      userId: log.user_id,
      timestamp: log.timestamp,
      taskTitle: rawTitle
        ? log.task_id
          ? rawTitle
          : `${rawTitle} (deleted)`
        : null,
      description: log.description,
      photoUrls: log.photo_urls?.length
        ? log.photo_urls
        : log.photo_url
          ? [log.photo_url]
          : [],
    };
  });

  const userName = new Map((allUsers ?? []).map((u) => [u.id, u.name]));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-ink">Logs</h1>
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
        <IndividualLogPicker
          users={allUsers ?? []}
          selectedId={individualPersonId}
        />
      )}

      {view === "individual" && !individualPersonId ? (
        <p className="mt-6 text-sm text-ink/50">
          Pick a member above to see their log.
        </p>
      ) : entries.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-hairline-strong bg-surface/60 p-10 text-center text-sm text-ink/50">
          Nothing logged yet.
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-hairline bg-surface p-4"
            >
              {view !== "mine" && (
                <p className="text-sm font-semibold text-ink">
                  {userName.get(entry.userId ?? "") ?? "A member"}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                {entry.taskTitle && (
                  <span className="text-xs font-semibold text-navy">
                    📌 {entry.taskTitle}
                  </span>
                )}
                <span className="text-[11px] text-ink/40">
                  {formatClockDateTime(entry.timestamp)}
                </span>
              </div>
              {entry.description && (
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink/70">
                  {entry.description}
                </p>
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
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
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
    </div>
  );
}
