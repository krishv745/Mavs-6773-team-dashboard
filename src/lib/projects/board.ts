import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TaskRow } from "@/lib/supabase/types";
import { PRIORITY_RANK } from "@/lib/priority";
import type { RowAssignee, TaskLogEntry } from "@/components/team/DashboardTaskRow";

type Client = SupabaseClient<Database>;
const STATUS_ORDER: Record<string, number> = { active: 0, completed: 1, archived: 2 };

export type BoardSort = "priority" | "timeline";

/**
 * Everything the Projects board (dashboard + My Tasks) needs to render a set
 * of task rows grouped by project: assignee avatars, activity logs, and the
 * per-project sorted task lists.
 */
export async function buildBoardData(supabase: Client, tasks: TaskRow[], sort: BoardSort) {
  const taskIds = tasks.map((t) => t.id);

  const [{ data: assigneeRows }, { data: logRows }] = await Promise.all([
    taskIds.length
      ? supabase.from("task_assignees").select("task_id, user_id").in("task_id", taskIds)
      : Promise.resolve({ data: [] as { task_id: string; user_id: string }[] }),
    taskIds.length
      ? supabase
          .from("task_logs")
          .select("id, task_id, user_id, timestamp, description, audio_transcript, photo_url, photo_urls")
          .in("task_id", taskIds)
          .order("timestamp", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const peopleIds = [
    ...new Set([
      ...(assigneeRows ?? []).map((r) => r.user_id),
      ...(logRows ?? []).map((l) => l.user_id).filter((id): id is string => Boolean(id)),
    ]),
  ];
  const { data: people } = peopleIds.length
    ? await supabase.from("users").select("id, name, avatar_url").in("id", peopleIds)
    : { data: [] as { id: string; name: string; avatar_url: string | null }[] };
  const personById = new Map((people ?? []).map((p) => [p.id, p]));
  const toAssignee = (userId: string): RowAssignee => ({
    id: userId,
    name: personById.get(userId)?.name ?? "A member",
    avatarUrl: personById.get(userId)?.avatar_url ?? null,
  });

  const byDeadline = (a: TaskRow, b: TaskRow) =>
    (a.deadline ?? "9999-99").localeCompare(b.deadline ?? "9999-99");
  const byPriority = (a: TaskRow, b: TaskRow) =>
    (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) || byDeadline(a, b);
  const within = sort === "timeline" ? byDeadline : byPriority;

  const tasksByProject = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    if (!t.project_id) continue;
    const list = tasksByProject.get(t.project_id) ?? [];
    list.push(t);
    tasksByProject.set(t.project_id, list);
  }
  for (const [projectId, list] of tasksByProject) {
    list.sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) || within(a, b));
    tasksByProject.set(projectId, list);
  }

  const assigneesByTask = new Map<string, RowAssignee[]>();
  for (const r of assigneeRows ?? []) {
    const list = assigneesByTask.get(r.task_id) ?? [];
    list.push(toAssignee(r.user_id));
    assigneesByTask.set(r.task_id, list);
  }

  const logsByTask = new Map<string, TaskLogEntry[]>();
  for (const l of logRows ?? []) {
    if (!l.task_id) continue;
    const person = l.user_id ? personById.get(l.user_id) : undefined;
    const list = logsByTask.get(l.task_id) ?? [];
    list.push({
      id: l.id,
      authorName: person?.name ?? "A member",
      authorAvatarUrl: person?.avatar_url ?? null,
      timestamp: l.timestamp,
      description: l.description,
      audioTranscript: l.audio_transcript,
      photoUrls: l.photo_urls?.length ? l.photo_urls : l.photo_url ? [l.photo_url] : [],
    });
    logsByTask.set(l.task_id, list);
  }

  return { tasksByProject, assigneesByTask, logsByTask };
}
