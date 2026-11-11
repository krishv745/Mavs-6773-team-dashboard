"use client";

import { useState, useTransition } from "react";
import InlineDeadline from "@/components/team/InlineDeadline";
import {
  removeTaskStageAction,
  setTaskStageCompleteAction,
  startTaskStageAction,
  updateTaskStageDeadlineAction,
} from "@/lib/tasks/actions";
import { STAGE_KINDS, stageLabel } from "@/lib/subteams";
import { MAX_DEADLINE, deadlineError, minDeadline } from "@/lib/deadlines";
import type { Subteam, TaskStageKind, TaskStageRow } from "@/lib/supabase/types";

/**
 * A task's follow-on stages — e.g. a CAD task that then goes to Mechanical,
 * Electrical, Software, and Testing. Each stage has its own deadline and done
 * checkbox. The task's own subteam is always the first ("Main") stage and
 * can't be removed. "Start" buttons list every stage not yet started;
 * picking one asks for an optional deadline.
 */
export default function TaskStages({
  taskId,
  taskSubteam,
  stages,
  editable,
}: {
  taskId: string;
  taskSubteam: Subteam;
  stages: TaskStageRow[];
  editable: boolean;
}) {
  const [starting, setStarting] = useState<TaskStageKind | null>(null);
  const [draftDeadline, setDraftDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const startedKinds = new Set(stages.map((s) => s.kind));
  const available = STAGE_KINDS.filter((k) => k.value !== taskSubteam && !startedKinds.has(k.value));
  // Main stage first, the rest in the order they were started.
  const ordered = [...stages].sort((a, b) => Number(b.kind === taskSubteam) - Number(a.kind === taskSubteam));

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else after?.();
    });
  }

  function submitStart() {
    if (!starting) return;
    if (draftDeadline) {
      const err = deadlineError(draftDeadline);
      if (err) {
        setError(err);
        return;
      }
    }
    const kind = starting;
    run(
      () => startTaskStageAction(taskId, kind, draftDeadline || null),
      () => {
        setStarting(null);
        setDraftDeadline("");
      },
    );
  }

  if (stages.length === 0 && !editable) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-ink/40">
        Stages{stages.length > 0 && ` (${stages.filter((s) => s.completed_at).length}/${stages.length} done)`}
      </p>

      {stages.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {ordered.map((stage) => {
            const done = Boolean(stage.completed_at);
            const isMain = stage.kind === taskSubteam;
            return (
              <li
                key={stage.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2"
              >
                <button
                  type="button"
                  disabled={!editable || isPending}
                  title={done ? "Reopen stage" : "Mark stage done"}
                  aria-label={done ? `Reopen ${stageLabel(stage.kind)}` : `Mark ${stageLabel(stage.kind)} done`}
                  onClick={() => run(() => setTaskStageCompleteAction(stage.id, !done))}
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded border transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    done
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-hairline-strongest bg-surface text-transparent hover:border-navy"
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    done ? "bg-black/5 text-ink/40 line-through" : "bg-navy/10 text-navy"
                  }`}
                >
                  {stageLabel(stage.kind)}
                </span>
                {isMain && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-ink/40">Main</span>
                )}
                <span className="text-xs text-ink/40">Due</span>
                <InlineDeadline
                  deadline={stage.deadline}
                  ongoing={false}
                  editable={editable && !done}
                  emptyLabel="＋ date"
                  compact
                  className="text-xs text-ink/60"
                  onSave={(next) => updateTaskStageDeadlineAction(stage.id, next)}
                />
                {editable && !isMain && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      if (confirm(`Remove the ${stageLabel(stage.kind)} stage?`)) {
                        run(() => removeTaskStageAction(stage.id));
                      }
                    }}
                    className="ml-auto text-xs text-ink/30 hover:text-crimson disabled:opacity-40"
                    aria-label={`Remove ${stageLabel(stage.kind)} stage`}
                    title="Remove stage"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && available.length > 0 && (
        <div className="mt-2">
          {starting ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-navy/30 bg-surface px-3 py-2">
              <span className="text-sm font-medium text-ink">Start {stageLabel(starting)}</span>
              <label className="flex items-center gap-1.5 text-xs text-ink/50">
                Deadline
                <input
                  type="date"
                  value={draftDeadline}
                  min={minDeadline()}
                  max={MAX_DEADLINE}
                  onChange={(e) => setDraftDeadline(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitStart();
                    }
                  }}
                  className="rounded-md border border-hairline-strong bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-navy"
                />
              </label>
              <button
                type="button"
                disabled={isPending}
                onClick={submitStart}
                className="rounded-md bg-crimson px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {isPending ? "Starting…" : "Start"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setStarting(null);
                  setDraftDeadline("");
                  setError(null);
                }}
                className="text-xs text-ink/50 hover:text-ink"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-ink/40">Start:</span>
              {available.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => {
                    setStarting(k.value);
                    setError(null);
                  }}
                  className="rounded-full border border-hairline-strong bg-surface px-2.5 py-0.5 text-xs font-medium text-ink/70 transition hover:border-navy hover:text-navy"
                >
                  ＋ {k.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-crimson">{error}</p>}
    </div>
  );
}
