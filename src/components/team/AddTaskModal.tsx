"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createTaskAction } from "@/lib/tasks/actions";
import { SUBTEAMS } from "@/lib/subteams";
import { PRIORITIES } from "@/lib/priority";
import SubmitButton from "@/components/team/SubmitButton";
import RichTextField from "@/components/team/RichTextField";
import MemberSelectionList, { type SelectableMember } from "@/components/team/MemberSelectionList";

export type AssignableMember = SelectableMember;

export default function AddTaskModal({
  projectId,
  members,
}: {
  projectId: string;
  members: AssignableMember[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(createTaskAction, undefined);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [ongoing, setOngoing] = useState(false);

  useEffect(() => {
    if (state?.error) dialogRef.current?.showModal();
    if (state?.ok) {
      dialogRef.current?.close();
      router.refresh();
    }
  }, [state, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setChecked(new Set());
          setOngoing(false);
          dialogRef.current?.showModal();
        }}
        className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white transition hover:bg-crimson-bright"
      >
        + Add Task
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl p-0 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="flex items-start justify-between">
            <h2 className="font-display text-xl font-bold text-ink">Add Task</h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ink/40 hover:text-ink/70"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <form action={formAction} className="mt-5 space-y-4">
            <input type="hidden" name="projectId" value={projectId} />

            <div>
              <label htmlFor="title" className="text-sm font-medium text-ink/80">
                Task name
              </label>
              <input
                id="title"
                name="title"
                required
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>

            <div>
              <label htmlFor="subteam" className="text-sm font-medium text-ink/80">
                Subteam
              </label>
              <select
                id="subteam"
                name="subteam"
                required
                defaultValue=""
                className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              >
                <option value="" disabled>
                  Select a subteam
                </option>
                {SUBTEAMS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="priority" className="text-sm font-medium text-ink/80">
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                defaultValue="medium"
                className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <RichTextField
              name="description"
              label="Description (optional)"
              rows={3}
              placeholder="What is this task about?"
            />

            <div>
              <label htmlFor="deadline" className="text-sm font-medium text-ink/80">
                Deadline
              </label>
              <input
                id="deadline"
                name="deadline"
                type="date"
                disabled={ongoing}
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 disabled:bg-tint/60 disabled:text-ink/40"
              />
              <label className="mt-2 flex items-center gap-2 text-sm text-ink/70">
                <input
                  type="checkbox"
                  name="ongoing"
                  checked={ongoing}
                  onChange={(e) => setOngoing(e.target.checked)}
                />
                Ongoing — no set due date
              </label>
              <p className="mt-1 text-xs text-ink/40">
                A dated deadline that&rsquo;s later than the project&rsquo;s moves the project deadline too.
              </p>
            </div>

            {members.length > 0 && (
              <div>
                <p className="text-sm font-medium text-ink/80">Assign to (optional)</p>
                <MemberSelectionList
                  members={members}
                  checked={checked}
                  onChange={setChecked}
                  name="assigneeIds"
                  maxHeightClassName="max-h-32"
                />
              </div>
            )}

            {state?.error && (
              <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
            )}

            <p className="text-xs text-ink/50">
              New tasks are hidden until an Admin approves them.
            </p>

            <SubmitButton>Submit task</SubmitButton>
          </form>
        </div>
      </dialog>
    </>
  );
}
