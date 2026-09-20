"use client";

import { completeProjectAction, reopenProjectAction } from "@/lib/tasks/actions";

export default function CompleteProjectButton({
  projectId,
  completed,
}: {
  projectId: string;
  completed: boolean;
}) {
  const action = (completed ? reopenProjectAction : completeProjectAction).bind(null, projectId);

  return (
    <form action={action} onClick={(e) => e.stopPropagation()} className="inline">
      <button
        type="submit"
        className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
          completed
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border-hairline-strong bg-surface text-ink/70 hover:bg-tint"
        }`}
      >
        {completed ? "✓ Completed — reopen" : "Mark project complete"}
      </button>
    </form>
  );
}
