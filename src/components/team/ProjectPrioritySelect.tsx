"use client";

import { useTransition } from "react";
import { updateProjectPriorityAction } from "@/lib/tasks/actions";
import { PRIORITIES, PRIORITY_STYLES } from "@/lib/priority";
import type { TaskPriority } from "@/lib/supabase/types";

export default function ProjectPrioritySelect({
  projectId,
  priority,
  disabled,
}: {
  projectId: string;
  priority: TaskPriority;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={priority}
      disabled={disabled || isPending}
      title="Project priority"
      onChange={(e) => {
        const value = e.target.value as TaskPriority;
        startTransition(async () => {
          await updateProjectPriorityAction(projectId, value);
        });
      }}
      className={`rounded-md border-0 px-2 py-1 text-xs font-semibold outline-none disabled:opacity-60 ${PRIORITY_STYLES[priority]}`}
    >
      {PRIORITIES.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label} priority
        </option>
      ))}
    </select>
  );
}
