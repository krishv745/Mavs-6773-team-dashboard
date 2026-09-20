"use client";

import { useTransition } from "react";
import { completeTaskAction, reopenTaskAction } from "@/lib/tasks/actions";

/** The Projects board's leftmost column — a real checkbox look, toggling completeTaskAction/reopenTaskAction directly. */
export default function TaskCompleteCheckbox({
  taskId,
  completed,
  disabled,
}: {
  taskId: string;
  completed: boolean;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const toggle = completed ? reopenTaskAction : completeTaskAction;

  return (
    <button
      type="button"
      disabled={disabled || isPending}
      title={completed ? "Reopen task" : "Mark complete"}
      aria-label={completed ? "Reopen task" : "Mark complete"}
      onClick={() => startTransition(() => toggle(taskId))}
      className={`flex h-5 w-5 flex-none items-center justify-center rounded border transition disabled:cursor-not-allowed disabled:opacity-40 ${
        completed
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-hairline-strongest bg-surface text-transparent hover:border-navy"
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
