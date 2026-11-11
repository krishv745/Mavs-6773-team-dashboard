import Link from "next/link";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { PRIORITY_RANK } from "@/lib/priority";
import { buildBoardData, type BoardSort } from "@/lib/projects/board";
import AddProjectModal from "@/components/team/AddProjectModal";
import ProjectJumpPicker from "@/components/team/ProjectJumpPicker";
import ProjectsBoardView from "@/components/team/ProjectsBoardView";
import TaskCalendar, { type CalendarItem } from "@/components/team/TaskCalendar";
import { DEFAULT_PROJECT_COLOR } from "@/lib/projectColors";
import { STAGE_SHORT, stageLabel } from "@/lib/subteams";
import type { TaskProjectRow } from "@/lib/supabase/types";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; task?: string; sort?: string; view?: string }>;
}) {
  const { project: focusProjectId, task: focusTaskId, sort: sortParam, view } = await searchParams;
  const sort: BoardSort = sortParam === "timeline" ? "timeline" : "priority";
  const calendarView = view === "calendar";
  const [profile, supabase] = await Promise.all([getCurrentProfile(), createServerClient()]);
  const canContribute = hasPermission(profile, "contribute");
  const canCreateTasks = hasPermission(profile, "create_tasks");
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
  const { tasksByProject, assigneesByTask, logsByTask, stagesByTask } = await buildBoardData(supabase, visibleTasks, sort);

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

  const sortHref = (s: BoardSort) => {
    const params = new URLSearchParams();
    if (focusProjectId) params.set("project", focusProjectId);
    if (focusTaskId) params.set("task", focusTaskId);
    if (s === "timeline") params.set("sort", "timeline");
    const q = params.toString();
    return `/team/projects${q ? `?${q}` : ""}`;
  };
  const calendarToggleHref = (() => {
    const params = new URLSearchParams();
    if (focusProjectId) params.set("project", focusProjectId);
    if (sort === "timeline") params.set("sort", "timeline");
    if (!calendarView) params.set("view", "calendar");
    const q = params.toString();
    return `/team/projects${q ? `?${q}` : ""}`;
  })();

  // Calendar view: every stage deadline of every non-archived task, plus each
  // project's own deadline, limited to the focused project if there is one.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
  const calendarItems: CalendarItem[] = [];
  if (calendarView) {
    for (const project of sortedProjects) {
      const color = project.color ?? DEFAULT_PROJECT_COLOR;
      if (project.deadline && !project.ongoing) {
        calendarItems.push({
          id: `project-${project.id}`,
          date: project.deadline,
          title: project.name,
          tag: "Project deadline",
          shortTag: "Project",
          color,
          href: `/team/projects?project=${project.id}`,
          done: Boolean(project.completed_at),
          isProject: true,
        });
      }
      for (const task of tasksByProject.get(project.id) ?? []) {
        if (task.status === "archived") continue;
        const stages = stagesByTask.get(task.id) ?? [];
        const taskDone = task.status === "completed";
        if (stages.length === 0 && task.deadline && !task.ongoing) {
          calendarItems.push({
            id: `task-${task.id}`,
            date: task.deadline,
            title: task.title,
            tag: stageLabel(task.subteam),
            shortTag: STAGE_SHORT[task.subteam],
            color,
            href: `/team/projects?task=${task.id}`,
            done: taskDone,
          });
        }
        for (const st of stages) {
          if (!st.deadline) continue;
          calendarItems.push({
            id: `stage-${st.id}`,
            date: st.deadline,
            title: task.title,
            tag: stageLabel(st.kind),
            shortTag: STAGE_SHORT[st.kind],
            color,
            href: `/team/projects?task=${task.id}`,
            done: taskDone || Boolean(st.completed_at),
          });
        }
      }
    }
  }

  return (
    <div>
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
          <Link
            href={calendarToggleHref}
            title={calendarView ? "Back to list view" : "Calendar view"}
            aria-label={calendarView ? "Back to list view" : "Calendar view"}
            aria-pressed={calendarView}
            className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${
              calendarView
                ? "border-navy bg-navy text-white"
                : "border-hairline-strong bg-surface text-ink/60 hover:bg-tint hover:text-ink"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
              <path d="M3 9.5h18M8 2.5v4M16 2.5v4" strokeLinecap="round" />
            </svg>
          </Link>
          {/* Always visible — from the calendar, either one switches back to the list sorted that way. */}
          <div className="flex rounded-md border border-hairline-strong bg-surface p-0.5 text-sm">
            <Link
              href={sortHref("priority")}
              className={`rounded px-2.5 py-1 font-medium transition ${
                !calendarView && sort === "priority" ? "bg-navy text-white" : "text-ink/60 hover:bg-tint"
              }`}
            >
              By priority
            </Link>
            <Link
              href={sortHref("timeline")}
              className={`rounded px-2.5 py-1 font-medium transition ${
                !calendarView && sort === "timeline" ? "bg-navy text-white" : "text-ink/60 hover:bg-tint"
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
          {canCreateTasks && <AddProjectModal variant="button" />}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {(projects ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline-strong bg-surface/60 p-10 text-center text-sm text-ink/50">
            No projects yet — use “Add project” above.
          </div>
        ) : calendarView ? (
          <TaskCalendar items={calendarItems} today={today} />
        ) : (
          <ProjectsBoardView
            projects={sortedProjects}
            tasksByProject={tasksByProject}
            assigneesByTask={assigneesByTask}
            logsByTask={logsByTask}
            stagesByTask={stagesByTask}
            members={members ?? []}
            focusTaskId={focusTaskId}
            canContribute={canContribute}
            canCreateTasks={canCreateTasks}
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
