"use client";

import { useRef } from "react";
import { deleteTaskAction } from "@/lib/tasks/actions";

export default function DeleteTaskButton({
  taskId,
  taskTitle,
  variant = "link",
}: {
  taskId: string;
  taskTitle: string;
  /** "link" text link · "compact" icon-only · "button" bordered button. */
  variant?: "link" | "compact" | "button";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deleteWithId = deleteTaskAction.bind(null, taskId);

  return (
    <>
      {variant === "compact" ? (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          title="Delete task"
          aria-label="Delete task"
          className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-ink/35 transition hover:bg-crimson/10 hover:text-crimson"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H6a1 1 0 01-1-1V6M10 11v6M14 11v6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : variant === "button" ? (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="flex-none rounded-md border border-crimson/30 bg-surface px-4 py-2 text-sm font-semibold text-crimson transition hover:bg-crimson/5"
        >
          Delete task
        </button>
      ) : (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="text-sm font-medium text-crimson/70 hover:text-crimson hover:underline"
        >
          Delete task
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h3 className="font-display text-lg font-bold text-ink">Delete &ldquo;{taskTitle}&rdquo;?</h3>
        <p className="mt-2 text-sm text-ink/60">
          Every log entry on this task goes with it. This can&rsquo;t be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-md px-4 py-2 text-sm font-medium text-ink/60 hover:bg-tint"
          >
            Cancel
          </button>
          <form action={deleteWithId}>
            <button
              type="submit"
              className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-bright"
            >
              Delete task
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
