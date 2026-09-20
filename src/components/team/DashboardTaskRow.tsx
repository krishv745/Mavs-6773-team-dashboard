"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Avatar from "@/components/team/Avatar";
import TaskCompleteCheckbox from "@/components/team/TaskCompleteCheckbox";
import TaskPrioritySelect from "@/components/team/TaskPrioritySelect";
import TaskDueTimeline from "@/components/team/TaskDueTimeline";
import TaskLogComposer from "@/components/team/TaskLogComposer";
import UnarchiveTaskButton from "@/components/team/UnarchiveTaskButton";
import DeleteTaskButton from "@/components/team/DeleteTaskButton";
import AssignMembersButton from "@/components/team/AssignMembersButton";
import InlineText from "@/components/team/InlineText";
import InlineDeadline from "@/components/team/InlineDeadline";
import { updateTaskFieldAction, updateTaskAssigneesAction } from "@/lib/tasks/actions";
import { SUBTEAMS, SUBTEAM_SHORT } from "@/lib/subteams";
import { priorityLabel, PRIORITY_STYLES } from "@/lib/priority";
import { renderFormattedText } from "@/lib/formatText";
import { formatClockDateTime } from "@/lib/formatTime";
import { isVideoUrl } from "@/lib/media";
import type { SelectableMember } from "@/components/team/MemberSelectionList";
import type { Subteam, TaskRow } from "@/lib/supabase/types";

/** Shared 8-column grid — the header row in ProjectsBoardView must use the same template.
 *  check · task · add-log · assigned · subteam · priority · timeline · delete
 *  Every column is fixed except Assigned, which soaks up the leftover width —
 *  so the trash sits flush right and Subteam/Priority/Timeline/Delete move as a
 *  block, and Assigned is the one section that grows to fit more people. */
export const TASK_GRID =
  "md:grid md:grid-cols-[1.5rem_minmax(8rem,27rem)_4.75rem_minmax(4rem,1fr)_5rem_5.25rem_9rem_1.75rem] md:items-center md:gap-1.5";

/** How many assignee avatars show inline before the rest roll up into a "+N". */
const MAX_AVATARS = 8;

export type RowAssignee = { id: string; name: string; avatarUrl: string | null };
export type TaskLogEntry = {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  timestamp: string;
  description: string | null;
  audioTranscript: string | null;
  photoUrls: string[];
};

export default function DashboardTaskRow({
  task,
  assignees,
  logs,
  members,
  autoExpand = false,
  canEditTasks,
  canDeleteTasks,
}: {
  task: TaskRow;
  assignees: RowAssignee[];
  logs: TaskLogEntry[];
  members: SelectableMember[];
  /** Start expanded and scroll into view — used when arriving from My Tasks. */
  autoExpand?: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
}) {
  const [open, setOpen] = useState(autoExpand);
  const [subteamPending, startSubteam] = useTransition();
  const rowRef = useRef<HTMLDivElement>(null);
  const done = task.status === "completed";
  const archived = task.status === "archived";

  useEffect(() => {
    if (autoExpand) rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [autoExpand]);

  return (
    <div
      ref={rowRef}
      className={`border-b border-hairline last:border-0 ${archived ? "bg-black/[0.015]" : ""} ${
        autoExpand ? "ring-2 ring-inset ring-navy/30" : ""
      }`}
    >
      {/* Row 1 — check · task · add-log · assigned · subteam · priority · timeline · delete */}
      <div className={`${TASK_GRID} px-3 py-2.5`}>
        <div className="flex items-center gap-2">
          <TaskCompleteCheckbox taskId={task.id} completed={done} disabled={!canEditTasks || archived} />
        </div>

        <div className="mt-1 flex min-w-0 items-center gap-2 md:mt-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex flex-none items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-ink/50 transition hover:bg-tint hover:text-ink"
            aria-label={open ? "Hide details" : "Show details"}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className={`transition-transform ${open ? "rotate-90" : ""}`}
            >
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Details
          </button>
          <InlineText
            value={task.title}
            editable={canEditTasks && !archived}
            truncate
            onSave={(next) => updateTaskFieldAction(task.id, "title", next)}
            ariaLabel="Task name"
            className={`text-sm font-medium ${
              done ? "text-ink/50 line-through" : archived ? "text-ink/50" : "text-ink"
            }`}
          />
          {archived && (
            <span className="flex-none rounded bg-hairline-strong px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink/50">
              Archived
            </span>
          )}
        </div>

        <div className="mt-2 flex min-w-0 justify-start md:mt-0">
          {!archived && <TaskLogComposer taskId={task.id} variant="cell" />}
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-1.5 md:mt-0">
          <span className="text-xs font-medium text-ink/40 md:hidden">Assigned:</span>
          <div className="flex min-w-0 flex-1 items-center overflow-hidden">
            {assignees.slice(0, MAX_AVATARS).map((a) => (
              <Avatar key={a.id} name={a.name} avatarUrl={a.avatarUrl} size="xs" className="-ml-1.5 first:ml-0" />
            ))}
            {assignees.length > MAX_AVATARS && (
              <span className="ml-1 flex-none text-[11px] font-medium text-ink/40">
                +{assignees.length - MAX_AVATARS}
              </span>
            )}
            {assignees.length === 0 && !canEditTasks && <span className="text-xs text-ink/40">Nobody</span>}
          </div>
          {canEditTasks && (
            <span className="flex-none">
              <AssignMembersButton
                members={members}
                assignedIds={assignees.map((a) => a.id)}
                onSave={(ids) => updateTaskAssigneesAction(task.id, ids)}
                title="Assign to task"
                variant="icon"
              />
            </span>
          )}
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-1.5 overflow-hidden md:mt-0">
          <span className="text-xs font-medium text-ink/40 md:hidden">Subteam:</span>
          {canEditTasks && !archived ? (
            <select
              defaultValue={task.subteam}
              disabled={subteamPending}
              title="Subteam"
              onChange={(e) => {
                const value = e.target.value as Subteam;
                startSubteam(async () => {
                  await updateTaskFieldAction(task.id, "subteam", value);
                });
              }}
              className="w-full min-w-0 rounded-md border-0 bg-navy/10 px-1 py-1 text-xs font-semibold text-navy outline-none disabled:opacity-50"
            >
              {SUBTEAMS.map((s) => (
                <option key={s.value} value={s.value}>
                  {SUBTEAM_SHORT[s.value]}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate rounded-full bg-navy/10 px-2 py-1 text-xs font-semibold text-navy">
              {SUBTEAM_SHORT[task.subteam]}
            </span>
          )}
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-1.5 overflow-hidden md:mt-0">
          <span className="text-xs font-medium text-ink/40 md:hidden">Priority:</span>
          {canEditTasks && !archived ? (
            <TaskPrioritySelect taskId={task.id} priority={task.priority} />
          ) : (
            <span className={`truncate rounded-full px-2 py-1 text-xs font-semibold ${PRIORITY_STYLES[task.priority]}`}>
              {priorityLabel(task.priority)}
            </span>
          )}
        </div>

        <div className="mt-2 min-w-0 overflow-hidden md:mt-0">
          <TaskDueTimeline
            createdAt={task.created_at}
            deadline={task.deadline}
            completed={done}
            ongoing={task.ongoing}
            className="w-full min-w-0"
            dateSlot={
              <InlineDeadline
                deadline={task.deadline}
                ongoing={task.ongoing}
                editable={canEditTasks && !archived}
                emptyLabel="＋ date"
                compact
                className="text-[11px] text-ink/40"
                onSave={(next) => updateTaskFieldAction(task.id, "deadline", next)}
              />
            }
          />
        </div>

        <div className="mt-2 flex items-center gap-1.5 md:mt-0 md:justify-end">
          <span className="text-xs font-medium text-ink/40 md:hidden">Delete:</span>
          {canDeleteTasks && <DeleteTaskButton taskId={task.id} taskTitle={task.title} variant="compact" />}
        </div>
      </div>

      {/* Expansion — read-only description + full log history (no "add log" here) */}
      {open && (
        <div className="space-y-4 border-t border-hairline bg-tint/25 px-4 py-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-ink/40">Description</p>
            <InlineText
              value={task.description ?? ""}
              multiline
              editable={canEditTasks && !archived}
              placeholder="Add a description…"
              onSave={(next) => updateTaskFieldAction(task.id, "description", next)}
              display={
                task.description ? (
                  <span className="whitespace-pre-wrap leading-relaxed text-ink/70">
                    {renderFormattedText(task.description)}
                  </span>
                ) : undefined
              }
              className="mt-1 block"
              inputClassName="mt-1 w-full rounded-md border border-navy/40 bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:ring-2 focus:ring-navy/10"
            />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-ink/40">
              Activity log{logs.length > 0 && ` (${logs.length})`}
            </p>
            {logs.length === 0 ? (
              <p className="mt-1 text-xs text-ink/40">No log entries yet — use “Add a log” above.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {logs.map((log) => (
                  <li key={log.id} className="rounded-lg border border-hairline bg-surface p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Avatar name={log.authorName} avatarUrl={log.authorAvatarUrl} size="xs" />
                        <span className="text-xs font-semibold text-ink">{log.authorName}</span>
                      </div>
                      <span className="text-[11px] text-ink/40">{formatClockDateTime(log.timestamp)}</span>
                    </div>
                    {log.description && (
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink/70">
                        {renderFormattedText(log.description)}
                      </p>
                    )}
                    {log.audioTranscript && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-sm text-ink/70">
                        <span className="mt-0.5 text-ink/30">🎤</span>
                        {log.audioTranscript}
                      </p>
                    )}
                    {log.photoUrls.length > 0 && (
                      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {log.photoUrls.map((url, i) =>
                          isVideoUrl(url) ? (
                            <video
                              key={url}
                              src={url}
                              controls
                              className="aspect-square w-full rounded-lg border border-hairline object-cover"
                            />
                          ) : (
                            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element -- Supabase storage URL, no next/image domain config */}
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

          {canEditTasks && archived && (
            <div>
              <UnarchiveTaskButton taskId={task.id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
