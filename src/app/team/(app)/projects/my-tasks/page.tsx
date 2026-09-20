import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { PRIORITY_RANK } from "@/lib/priority";
import { buildBoardData, type BoardSort } from "@/lib/projects/board";
import ProjectsBoardView from "@/components/team/ProjectsBoardView";
import type { TaskProjectRow } from "@/lib/supabase/types";

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; done?: string }>;
}) {
  const { sort: sortParam, done } = await searchParams;
  const sort: BoardSort = sortParam === "timeline" ? "timeline" : "priority";
  const hideDone = done === "hide";

  const [profile, supabase] = await Promise.all([getCurrentProfile(), createServerClient()]);
  if (!profile) redirect("/team/login");
  const canEditTasks = hasPermission(profile, "edit_tasks");
  const canDeleteTasks = hasPermission(profile, "delete_tasks");
  const canEditProjects = hasPermission(profile, "edit_projects");
  const canDeleteProjects = hasPermission(profile, "delete_projects");

  const { data: assigneeRows } = await supabase
    .from("task_assignees")
    .select("task_id")
    .eq("user_id", profile.id);
  const myTaskIds = (assigneeRows ?? []).map((r) => r.task_id);

  const { data: allMine } = myTaskIds.length
    ? await supabase.from("tasks").select("*").in("id", myTaskIds).in("status", ["active", "completed"])
    : { data: [] };
  const myTasks = (allMine ?? []).filter((t) => (hideDone ? t.status !== "completed" : true));

  const projectIds = [...new Set(myTasks.map((t) => t.project_id).filter((id): id is string => Boolean(id)))];
  const [{ data: projects }, { data: members }] = await Promise.all([
    projectIds.length
      ? supabase.from("task_projects").select("*").in("id", projectIds)
      : Promise.resolve({ data: [] as TaskProjectRow[] }),
    supabase.from("users").select("id, name, role").order("name", { ascending: true }),
  ]);

  const { tasksByProject, assigneesByTask, logsByTask } = await buildBoardData(supabase, myTasks, sort);

  const rank = (p: TaskProjectRow) => PRIORITY_RANK[p.priority] ?? 1;
  const sortedProjects = [...(projects ?? [])].sort(
    (a, b) =>
      Number(Boolean(a.completed_at)) - Number(Boolean(b.completed_at)) ||
      rank(a) - rank(b) ||
      b.created_at.localeCompare(a.created_at),
  );

  const doneCount = (allMine ?? []).filter((t) => t.status === "completed").length;
  const link = (next: { sort?: BoardSort; done?: boolean }) => {
    const p = new URLSearchParams();
    const s = next.sort ?? sort;
    const d = next.done ?? hideDone;
    if (s === "timeline") p.set("sort", "timeline");
    if (d) p.set("done", "hide");
    const q = p.toString();
    return `/team/projects/my-tasks${q ? `?${q}` : ""}`;
  };

  return (
    <div>
      <Link href="/team/projects" className="text-sm font-medium text-ink/50 hover:text-ink">
        ← Back to projects
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">My tasks</h1>
          <p className="mt-1 text-sm text-ink/60">
            {myTasks.length} shown across {sortedProjects.length} project{sortedProjects.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-hairline-strong bg-surface p-0.5 text-sm">
            <Link
              href={link({ sort: "priority" })}
              className={`rounded px-2.5 py-1 font-medium transition ${
                sort === "priority" ? "bg-navy text-white" : "text-ink/60 hover:bg-tint"
              }`}
            >
              By priority
            </Link>
            <Link
              href={link({ sort: "timeline" })}
              className={`rounded px-2.5 py-1 font-medium transition ${
                sort === "timeline" ? "bg-navy text-white" : "text-ink/60 hover:bg-tint"
              }`}
            >
              By timeline
            </Link>
          </div>
          {doneCount > 0 && (
            <Link
              href={link({ done: !hideDone })}
              className="rounded-md border border-hairline-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink/70 hover:bg-tint"
            >
              {hideDone ? `Show completed (${doneCount})` : "Hide completed"}
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6">
        {myTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline-strong bg-surface/60 p-10 text-center text-sm text-ink/50">
            {hideDone && doneCount > 0
              ? "Nothing outstanding — all your tasks are done."
              : "Nothing's assigned to you right now."}
          </div>
        ) : (
          <ProjectsBoardView
            projects={sortedProjects}
            tasksByProject={tasksByProject}
            assigneesByTask={assigneesByTask}
            logsByTask={logsByTask}
            members={members ?? []}
            canEditTasks={canEditTasks}
            canDeleteTasks={canDeleteTasks}
            canEditProjects={canEditProjects}
            canDeleteProjects={canDeleteProjects}
          />
        )}
      </div>
    </div>
  );
}
