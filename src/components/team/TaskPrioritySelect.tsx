"use client";

import { useTransition } from "react";
import { updateTaskPriorityAction } from "@/lib/tasks/actions";
import { PRIORITIES, PRIORITY_STYLES } from "@/lib/priority";
import type { TaskPriority } from "@/lib/supabase/types";

export default function TaskPrioritySelect({ taskId, priority }: { taskId: string; priority: TaskPriority }) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={priority}
      disabled={isPending}
      onChange={(e) => {
        const value = e.target.value as TaskPriority;
        startTransition(async () => {
          await updateTaskPriorityAction(taskId, value);
        });
      }}
      className={`w-full min-w-0 rounded-md border-0 px-1 py-1 text-xs font-semibold outline-none disabled:opacity-50 ${PRIORITY_STYLES[priority]}`}
    >
      {PRIORITIES.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
    </select>
  );
}
