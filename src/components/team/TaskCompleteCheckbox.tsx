"use client";

import { useTransition } from "react";
import { completeTaskAction, reopenTaskAction } from "@/lib/tasks/actions";

/**
 * The Projects board's leftmost column — a real checkbox look, toggling
 * completeTaskAction/reopenTaskAction directly. For a task with several
 * stages, the box fills from the bottom in proportion to how many stages are
 * done (1 of 3 done → a third filled) until the task itself is checked off.
 */
export default function TaskCompleteCheckbox({
  taskId,
  completed,
  disabled,
  stagesDone = 0,
  stagesTotal = 0,
}: {
  taskId: string;
  completed: boolean;
  disabled?: boolean;
  stagesDone?: number;
  stagesTotal?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const toggle = completed ? reopenTaskAction : completeTaskAction;
  const showProgress = !completed && stagesTotal > 1 && stagesDone > 0;
  const fraction = showProgress ? Math.min(stagesDone / stagesTotal, 1) : 0;
  const label = completed
    ? "Reopen task"
    : stagesTotal > 1
      ? `Mark complete (${stagesDone}/${stagesTotal} stages done)`
      : "Mark complete";

  return (
    <button
      type="button"
      disabled={disabled || isPending}
      title={label}
      aria-label={label}
      onClick={() => startTransition(() => toggle(taskId))}
      className={`relative flex h-5 w-5 flex-none items-center justify-center overflow-hidden rounded border transition disabled:cursor-not-allowed disabled:opacity-40 ${
        completed
          ? "border-emerald-500 bg-emerald-500 text-white"
          : showProgress
            ? "border-emerald-500 bg-surface text-transparent hover:border-navy"
            : "border-hairline-strongest bg-surface text-transparent hover:border-navy"
      }`}
    >
      {showProgress && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 bg-emerald-500/70"
          style={{ height: `${fraction * 100}%` }}
        />
      )}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="relative">
        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
