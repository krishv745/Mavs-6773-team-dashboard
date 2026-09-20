"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addTaskLogFromDashboardAction } from "@/lib/tasks/actions";
import NoteFields from "@/components/team/NoteFields";
import SubmitButton from "@/components/team/SubmitButton";

/**
 * The Projects dashboard's "+" — a full log entry (note + any number of
 * photos + voice dictation) added inline without leaving the board.
 */
export default function TaskLogComposer({
  taskId,
  variant = "icon",
}: {
  taskId: string;
  /** "icon" compact + · "cell" small labeled button (grid column) · "button" big flex-1 button · "inline" the form embedded. */
  variant?: "icon" | "cell" | "button" | "inline";
}) {
  const [state, formAction] = useActionState(addTaskLogFromDashboardAction, undefined);
  const [formKey, setFormKey] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!state?.ok) return;
    // Successful submit — remount the uncontrolled composer to clear its
    // fields, and (for the dialog variant) close it.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset-after-submit, same pattern as NoteFields
    setFormKey((k) => k + 1);
    dialogRef.current?.close();
  }, [state]);

  const form = (
    <form key={formKey} action={formAction} className="space-y-3">
      <input type="hidden" name="taskId" value={taskId} />
      <NoteFields label="What did you work on?" rows={3} />
      {state?.error && <p className="text-sm text-crimson">{state.error}</p>}
      <SubmitButton>Add log</SubmitButton>
    </form>
  );

  if (variant === "inline") {
    return <div>{form}</div>;
  }

  return (
    <>
      {variant === "button" ? (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-navy/30 bg-navy/5 px-4 py-2 text-sm font-semibold text-navy transition hover:bg-navy/10"
        >
          <span className="text-base leading-none">＋</span> Add a log
        </button>
      ) : variant === "cell" ? (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-md border border-navy/25 bg-navy/5 px-1.5 py-1 text-xs font-semibold text-navy transition hover:bg-navy/10"
        >
          <span className="text-sm leading-none">＋</span> Add log
        </button>
      ) : (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          title="Add a log entry"
          aria-label="Add a log entry"
          className="flex h-6 w-6 flex-none items-center justify-center rounded text-ink/30 transition hover:bg-navy/10 hover:text-navy"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl p-0 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="flex items-start justify-between">
            <h2 className="font-display text-xl font-bold text-ink">Add a log entry</h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ink/40 hover:text-ink/70"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="mt-5">{form}</div>
        </div>
      </dialog>
    </>
  );
}
