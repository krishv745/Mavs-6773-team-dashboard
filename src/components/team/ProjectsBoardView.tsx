"use client";

import { useState, useTransition } from "react";
import DashboardProjectHeader from "@/components/team/DashboardProjectHeader";
import DashboardTaskRow, { TASK_GRID, type RowAssignee, type TaskLogEntry } from "@/components/team/DashboardTaskRow";
import { moveTaskToProjectAction } from "@/lib/tasks/actions";
import type { SelectableMember } from "@/components/team/MemberSelectionList";
import type { TaskProjectRow, TaskRow } from "@/lib/supabase/types";

type DraggingTask = { id: string; title: string; fromProjectId: string };

/**
 * The Projects dashboard — the only view. Every project is a color-coded
 * card carrying all of its own controls (rename, deadline, color, priority,
 * complete, delete) and its full task list. Every value is edited in place;
 * each task row expands to show its description and activity log. Adding a
 * log is done from the row's own "Add a log" button, not the expander.
 *
 * "Move tasks" is a toggleable drag mode (button above the board): each row
 * grows a drag handle, and dragging it onto a different project's card moves
 * the task there. Pointer Events (not the HTML5 drag-and-drop API) so this
 * works with touch as well as a mouse. Task placement is kept in local state
 * so a move shows immediately instead of waiting on the server round-trip,
 * and resyncs to the server's own grouping whenever the board re-renders
 * with fresh data (e.g. right after that same move's own revalidation).
 */
export default function ProjectsBoardView({
  projects,
  tasksByProject,
  assigneesByTask,
  logsByTask,
  members,
  focusTaskId,
  canEditTasks,
  canDeleteTasks,
  canEditProjects,
  canDeleteProjects,
}: {
  projects: TaskProjectRow[];
  tasksByProject: Map<string, TaskRow[]>;
  assigneesByTask: Map<string, RowAssignee[]>;
  logsByTask: Map<string, TaskLogEntry[]>;
  members: SelectableMember[];
  /** Task to auto-expand and scroll to (from My Tasks). */
  focusTaskId?: string;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canEditProjects: boolean;
  canDeleteProjects: boolean;
}) {
  // Local, optimistic mirror of the server-grouped tasks — a move shows
  // instantly instead of waiting on the round-trip, then resyncs to the
  // server's own grouping whenever it changes (e.g. right after that same
  // move's own revalidation). Adjusting state during render (React's
  // documented pattern for "derive from a changed prop") rather than in a
  // useEffect avoids an extra render pass on every board refresh.
  const [localTasksByProject, setLocalTasksByProject] = useState(tasksByProject);
  const [syncedFrom, setSyncedFrom] = useState(tasksByProject);
  if (tasksByProject !== syncedFrom) {
    setSyncedFrom(tasksByProject);
    setLocalTasksByProject(tasksByProject);
  }

  const [moveMode, setMoveMode] = useState(false);
  const [dragging, setDragging] = useState<DraggingTask | null>(null);
  const [overProjectId, setOverProjectId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const card = el?.closest<HTMLElement>("[data-project-id]");
    setOverProjectId(card?.dataset.projectId ?? null);
  }

  function handlePointerUp(e: React.PointerEvent) {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!dragging) return;
    const targetProjectId = overProjectId;
    const task = dragging;
    setDragging(null);
    setOverProjectId(null);
    if (!targetProjectId || targetProjectId === task.fromProjectId) return;

    // Optimistic move — pulled from its old project's list, appended to the
    // new one — then confirmed (or rolled back) against the server.
    setLocalTasksByProject((prev) => {
      const next = new Map(prev);
      const fromList = (next.get(task.fromProjectId) ?? []).filter((t) => t.id !== task.id);
      next.set(task.fromProjectId, fromList);
      const moved = tasksByProject.get(task.fromProjectId)?.find((t) => t.id === task.id);
      const original = moved ?? prev.get(task.fromProjectId)?.find((t) => t.id === task.id);
      if (original) {
        next.set(targetProjectId, [...(next.get(targetProjectId) ?? []), { ...original, project_id: targetProjectId }]);
      }
      return next;
    });

    startTransition(async () => {
      const result = await moveTaskToProjectAction(task.id, targetProjectId);
      if (result?.error) {
        setMoveError(result.error);
        setLocalTasksByProject(tasksByProject); // roll back to last known-good server state
      }
    });
  }

  function startDrag(e: React.PointerEvent, task: TaskRow) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setMoveError(null);
    setDragging({ id: task.id, title: task.title, fromProjectId: task.project_id ?? "" });
  }

  return (
    <div className="space-y-3">
      {canEditTasks && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMoveMode((m) => !m);
              setDragging(null);
              setOverProjectId(null);
              setMoveError(null);
            }}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition ${
              moveMode
                ? "border-navy bg-navy text-white"
                : "border-hairline-strong bg-surface text-ink/70 hover:bg-tint"
            }`}
          >
            {moveMode ? "✕ Done moving tasks" : "⇄ Move tasks"}
          </button>
          {moveMode && (
            <p className="text-xs text-ink/40">
              Drag the ⠿ handle on a task onto a different project to move it there.
            </p>
          )}
        </div>
      )}

      {moveError && (
        <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{moveError}</p>
      )}

      <div className="space-y-6">
        {projects.map((project) => {
          const completedProject = Boolean(project.completed_at);
          const tasks = localTasksByProject.get(project.id) ?? [];
          const isDropTarget =
            moveMode && dragging && overProjectId === project.id && dragging.fromProjectId !== project.id;

          return (
            <div
              key={project.id}
              data-project-id={project.id}
              className={`overflow-hidden rounded-xl border bg-surface transition ${
                isDropTarget
                  ? "border-navy ring-2 ring-navy/40"
                  : completedProject
                    ? "border-emerald-100 opacity-60 grayscale hover:opacity-100 hover:grayscale-0"
                    : "border-hairline"
              }`}
            >
              <DashboardProjectHeader
                project={{
                  id: project.id,
                  name: project.name,
                  color: project.color,
                  priority: project.priority,
                  deadline: project.deadline,
                  ongoing: project.ongoing,
                  description: project.description,
                  completedAt: project.completed_at,
                }}
                members={members}
                canEditProjects={canEditProjects}
                canDeleteProjects={canDeleteProjects}
              />

              {tasks.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-ink/40">
                  {isDropTarget ? "Drop to move here" : "No tasks yet."}
                </p>
              ) : (
                <div>
                  <div
                    className={`${TASK_GRID} hidden border-b border-hairline px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink/40`}
                  >
                    <span />
                    <span>Task</span>
                    <span>Log</span>
                    <span>Assigned</span>
                    <span>Team</span>
                    <span>Priority</span>
                    <span>Timeline</span>
                    <span />
                  </div>
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`flex items-stretch border-b border-hairline last:border-0 ${
                        dragging?.id === task.id ? "opacity-40" : ""
                      }`}
                    >
                      {moveMode && (
                        <button
                          type="button"
                          onPointerDown={(e) => startDrag(e, task)}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                          title="Drag to move this task to another project"
                          aria-label={`Drag ${task.title} to another project`}
                          className="flex w-7 flex-none cursor-grab touch-none items-center justify-center border-r border-hairline bg-tint text-ink/40 hover:bg-hairline hover:text-ink active:cursor-grabbing"
                        >
                          ⠿
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <DashboardTaskRow
                          task={task}
                          assignees={assigneesByTask.get(task.id) ?? []}
                          logs={logsByTask.get(task.id) ?? []}
                          members={members}
                          autoExpand={task.id === focusTaskId}
                          canEditTasks={canEditTasks}
                          canDeleteTasks={canDeleteTasks}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
