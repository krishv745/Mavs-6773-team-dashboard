import Link from "next/link";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { WEEKLY_MINIMUM_MINUTES, startOfWeek, sessionMinutes } from "@/lib/hours";
import { PRIORITY_RANK } from "@/lib/priority";
import { buildBoardData, type BoardSort } from "@/lib/projects/board";
import AddProjectModal from "@/components/team/AddProjectModal";
import ProjectJumpPicker from "@/components/team/ProjectJumpPicker";
import ProjectsBoardView from "@/components/team/ProjectsBoardView";
import type { TaskProjectRow } from "@/lib/supabase/types";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; task?: string; sort?: string }>;
}) {
  const { project: focusProjectId, task: focusTaskId, sort: sortParam } = await searchParams;
  const sort: BoardSort = sortParam === "timeline" ? "timeline" : "priority";
  const [profile, supabase] = await Promise.all([getCurrentProfile(), createServerClient()]);
  const canEditTasks = hasPermission(profile, "edit_tasks");
  const canDeleteTasks = hasPermission(profile, "delete_tasks");
  const canEditProjects = hasPermission(profile, "edit_projects");
  const canDeleteProjects = hasPermission(profile, "delete_projects");

  const [{ data: projects }, { data: tasks }, { data: members }] = await Promise.all([
    supabase.from("task_projects").select("*"),
    supabase.from("tasks").select("*").neq("status", "pending"),
    supabase.from("users").select("id, name, role").order("name", { ascending: true }),
  ]);

  const visibleTasks = tasks ?? [];
  const { tasksByProject, assigneesByTask, logsByTask } = await buildBoardData(supabase, visibleTasks, sort);

  // Highest priority first, completed projects sink to the bottom.
  const rank = (p: TaskProjectRow) => PRIORITY_RANK[p.priority] ?? 1;
  let sortedProjects = [...(projects ?? [])].sort(
    (a, b) =>
      Number(Boolean(a.completed_at)) - Number(Boolean(b.completed_at)) ||
      rank(a) - rank(b) ||
      b.created_at.localeCompare(a.created_at),
  );
  // A ?task= (from My Tasks) also pins us to that task's project.
  const focusTaskProjectId = focusTaskId
    ? (visibleTasks.find((t) => t.id === focusTaskId)?.project_id ?? undefined)
    : undefined;
  const targetProjectId = focusProjectId ?? focusTaskProjectId;
  const focused = targetProjectId ? sortedProjects.find((p) => p.id === targetProjectId) : undefined;
  if (focused) sortedProjects = [focused];

  let weeklyMinutes = 0;
  if (profile && profile.role !== "parent") {
    const weekStart = startOfWeek(new Date()).toISOString();
    const { data: mySessions } = await supabase
      .from("clock_sessions")
      .select("clock_in, clock_out")
      .eq("user_id", profile.id)
      .gte("clock_in", weekStart);
    // eslint-disable-next-line react-hooks/purity -- server-rendered timestamp for an open session, not a memoized value
    const now = Date.now();
    weeklyMinutes = (mySessions ?? []).reduce((sum, s) => sum + sessionMinutes(s.clock_in, s.clock_out, now), 0);
  }
  const underWeeklyMinimum = profile && profile.role !== "parent" && weeklyMinutes < WEEKLY_MINIMUM_MINUTES;

  const sortHref = (s: BoardSort) => {
    const params = new URLSearchParams();
    if (focusProjectId) params.set("project", focusProjectId);
    if (focusTaskId) params.set("task", focusTaskId);
    if (s === "timeline") params.set("sort", "timeline");
    const q = params.toString();
    return `/team/projects${q ? `?${q}` : ""}`;
  };

  return (
    <div>
      {underWeeklyMinimum && (
        <div className="mb-6 rounded-lg border border-crimson/20 bg-crimson/5 px-4 py-3 text-sm text-crimson">
          You&rsquo;re at {(weeklyMinutes / 60).toFixed(1)}h this week — the team asks for 6+ hours.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Projects</h1>
          {focused ? (
            <p className="mt-1 text-sm text-ink/60">
              Showing {focused.name} ·{" "}
              <Link href="/team/projects" className="font-medium text-navy hover:underline">
                show all
              </Link>
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink/60">{(projects ?? []).length} projects</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-hairline-strong bg-surface p-0.5 text-sm">
            <Link
              href={sortHref("priority")}
              className={`rounded px-2.5 py-1 font-medium transition ${
                sort === "priority" ? "bg-navy text-white" : "text-ink/60 hover:bg-tint"
              }`}
            >
              By priority
            </Link>
            <Link
              href={sortHref("timeline")}
              className={`rounded px-2.5 py-1 font-medium transition ${
                sort === "timeline" ? "bg-navy text-white" : "text-ink/60 hover:bg-tint"
              }`}
            >
              By timeline
            </Link>
          </div>
          {profile && (
            <Link
              href="/team/projects/my-tasks"
              className="rounded-md border border-hairline-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink/70 hover:bg-tint"
            >
              My tasks
            </Link>
          )}
          <ProjectJumpPicker
            projects={[...(projects ?? [])]
              .filter((p) => !p.completed_at)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => ({ id: p.id, name: p.name }))}
          />
          <AddProjectModal variant="button" />
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {(projects ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline-strong bg-surface/60 p-10 text-center text-sm text-ink/50">
            No projects yet — use “Add project” above.
          </div>
        ) : (
          <ProjectsBoardView
            projects={sortedProjects}
            tasksByProject={tasksByProject}
            assigneesByTask={assigneesByTask}
            logsByTask={logsByTask}
            members={members ?? []}
            focusTaskId={focusTaskId}
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
