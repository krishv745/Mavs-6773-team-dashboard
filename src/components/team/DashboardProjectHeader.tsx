"use client";

import { useState, useTransition } from "react";
import AddTaskModal from "@/components/team/AddTaskModal";
import DeleteProjectButton from "@/components/team/DeleteProjectButton";
import CompleteProjectButton from "@/components/team/CompleteProjectButton";
import ProjectColorPicker from "@/components/team/ProjectColorPicker";
import ProjectPrioritySelect from "@/components/team/ProjectPrioritySelect";
import InlineText from "@/components/team/InlineText";
import InlineDeadline from "@/components/team/InlineDeadline";
import {
  renameTaskProjectAction,
  setTaskProjectDeadlineAction,
  updateTaskProjectDescriptionAction,
  duplicateProjectAction,
} from "@/lib/tasks/actions";
import { priorityLabel, PRIORITY_STYLES } from "@/lib/priority";
import { renderFormattedText } from "@/lib/formatText";
import { DEFAULT_PROJECT_COLOR } from "@/lib/projectColors";
import type { SelectableMember } from "@/components/team/MemberSelectionList";
import type { TaskPriority } from "@/lib/supabase/types";

type ProjectSummary = {
  id: string;
  name: string;
  color: string | null;
  priority: TaskPriority;
  deadline: string | null;
  ongoing: boolean;
  description: string | null;
  completedAt: string | null;
};

export default function DashboardProjectHeader({
  project,
  members,
  canEditProjects,
  canDeleteProjects,
}: {
  project: ProjectSummary;
  members: SelectableMember[];
  canEditProjects: boolean;
  canDeleteProjects: boolean;
}) {
  const color = project.color ?? DEFAULT_PROJECT_COLOR;
  const completed = Boolean(project.completedAt);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = Boolean(project.deadline) && !completed && project.deadline! < today;
  const [open, setOpen] = useState(false);
  const [dupPending, startDup] = useTransition();

  return (
    <div className="border-l-4" style={{ borderLeftColor: color, backgroundColor: `${color}14` }}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Hide project details" : "Show project details"}
            className="flex h-5 w-5 flex-none items-center justify-center rounded text-ink/40 transition hover:bg-hairline hover:text-ink"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className={`transition-transform ${open ? "rotate-90" : ""}`}
            >
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {canEditProjects ? (
            <ProjectColorPicker projectId={project.id} currentColor={project.color} />
          ) : (
            <span className="h-4 w-4 flex-none rounded-full" style={{ backgroundColor: color }} />
          )}
          <InlineText
            value={project.name}
            editable={canEditProjects}
            truncate
            ariaLabel="Project name"
            onSave={(next) => renameTaskProjectAction(project.id, next)}
            className="font-display text-base font-bold text-ink"
          />
          {completed && (
            <span className="flex-none rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              Completed
            </span>
          )}
          {canEditProjects ? (
            <ProjectPrioritySelect projectId={project.id} priority={project.priority} />
          ) : (
            <span
              className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_STYLES[project.priority]}`}
            >
              {priorityLabel(project.priority)}
            </span>
          )}
          <span className={`text-xs ${overdue ? "font-semibold text-crimson" : "text-ink/50"}`}>
            Due{" "}
            <InlineDeadline
              deadline={project.deadline}
              ongoing={project.ongoing}
              editable={canEditProjects}
              emptyLabel="— set a date"
              onSave={(next) => setTaskProjectDeadlineAction(project.id, next)}
            />
          </span>
        </div>

        <div className="flex flex-none flex-wrap items-center gap-2">
          {canEditProjects && <CompleteProjectButton projectId={project.id} completed={completed} />}
          <AddTaskModal projectId={project.id} members={members} />
          {canEditProjects && (
            <button
              type="button"
              disabled={dupPending}
              onClick={() =>
                startDup(async () => {
                  await duplicateProjectAction(project.id);
                })
              }
              className="rounded-md border border-hairline-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink/70 transition hover:bg-tint disabled:opacity-50"
            >
              {dupPending ? "Duplicating…" : "Duplicate"}
            </button>
          )}
          {canDeleteProjects && <DeleteProjectButton projectId={project.id} projectName={project.name} />}
        </div>
      </div>

      {open && (
        <div className="border-t border-hairline px-4 py-3 pl-11 text-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink/40">Description</p>
          <InlineText
            value={project.description ?? ""}
            multiline
            editable={canEditProjects}
            placeholder="Add a project description…"
            onSave={(next) => updateTaskProjectDescriptionAction(project.id, next)}
            display={
              project.description ? (
                <span className="whitespace-pre-wrap leading-relaxed text-ink/70">
                  {renderFormattedText(project.description)}
                </span>
              ) : undefined
            }
            className="mt-1 block"
            inputClassName="mt-1 w-full rounded-md border border-navy/40 bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:ring-2 focus:ring-navy/10"
          />
        </div>
      )}
    </div>
  );
}
