"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createTaskAction } from "@/lib/tasks/actions";
import { STAGE_KINDS, isSubteam, stageLabel } from "@/lib/subteams";
import type { TaskStageKind } from "@/lib/supabase/types";
import { PRIORITIES } from "@/lib/priority";
import SubmitButton from "@/components/team/SubmitButton";
import { MAX_DEADLINE, minDeadline } from "@/lib/deadlines";
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
  // Stages in the order they were picked; the first subteam among them
  // (Testing isn't a subteam) becomes the task's main subteam.
  const [stages, setStages] = useState<TaskStageKind[]>([]);
  const main = stages.find((k) => isSubteam(k));

  function toggleStage(kind: TaskStageKind) {
    setStages((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]));
  }

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
          setStages([]);
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
              <p className="text-sm font-medium text-ink/80">Stages</p>
              <p className="mt-0.5 text-xs text-ink/40">
                Pick every subteam this task goes through, in order. The first subteam you pick is the
                task&rsquo;s main subteam. Each stage gets its own deadline.
              </p>
              {main && <input type="hidden" name="subteam" value={main} />}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STAGE_KINDS.map((k) => {
                  const on = stages.includes(k.value);
                  return (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => toggleStage(k.value)}
                      aria-pressed={on}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        on
                          ? "border-navy bg-navy text-white"
                          : "border-hairline-strong bg-surface text-ink/70 hover:border-navy hover:text-navy"
                      }`}
                    >
                      {on ? "✓" : "＋"} {k.label}
                    </button>
                  );
                })}
              </div>
              {stages.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {stages.map((kind, i) => (
                    <div key={kind} className="flex items-center gap-2">
                      {kind !== main && <input type="hidden" name="stageKinds" value={kind} />}
                      <span className="w-28 flex-none text-sm text-ink/80">
                        <span className="text-ink/40">{i + 1}.</span> {stageLabel(kind)}
                        {kind === main && <span className="ml-1 text-[10px] uppercase text-ink/40">main</span>}
                      </span>
                      <input
                        type="date"
                        name={`stageDeadline_${kind}`}
                        min={minDeadline()}
                        max={MAX_DEADLINE}
                        disabled={ongoing}
                        aria-label={`${stageLabel(kind)} deadline`}
                        className="min-w-0 flex-1 rounded-md border border-hairline-strong px-3 py-1.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 disabled:bg-tint/60 disabled:text-ink/40"
                      />
                    </div>
                  ))}
                </div>
              )}
              {stages.length > 0 && !main && (
                <p className="mt-1.5 text-xs text-crimson">
                  Pick at least one subteam. Testing can&rsquo;t be the only stage.
                </p>
              )}
              <label className="mt-2 flex items-center gap-2 text-sm text-ink/70">
                <input
                  type="checkbox"
                  name="ongoing"
                  checked={ongoing}
                  onChange={(e) => setOngoing(e.target.checked)}
                />
                Ongoing — no set due dates
              </label>
              <p className="mt-1 text-xs text-ink/40">
                The task is due when its last stage is due. If that&rsquo;s later than the project&rsquo;s deadline,
                the project deadline moves too.
              </p>
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

            <SubmitButton>Submit task</SubmitButton>
          </form>
        </div>
      </dialog>
    </>
  );
}
