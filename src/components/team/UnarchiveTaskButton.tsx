"use client";

import { unarchiveTaskAction } from "@/lib/tasks/actions";

export default function UnarchiveTaskButton({ taskId, variant }: { taskId: string; variant?: "button" }) {
  const unarchiveWithId = unarchiveTaskAction.bind(null, taskId);

  return (
    <form action={unarchiveWithId} onClick={(e) => e.stopPropagation()} className="inline">
      <button
        type="submit"
        className={
          variant === "button"
            ? "flex-none rounded-md border border-hairline-strong bg-surface px-4 py-2 text-sm font-semibold text-navy transition hover:bg-tint"
            : "text-xs font-semibold text-navy hover:underline"
        }
      >
        Unarchive task
      </button>
    </form>
  );
}
