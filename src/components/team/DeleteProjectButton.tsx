"use client";

import { useActionState, useRef, useState } from "react";
import { deleteProjectAction } from "@/lib/tasks/actions";

export default function DeleteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(deleteProjectAction, undefined);
  const [confirmName, setConfirmName] = useState("");

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="text-xs font-medium text-crimson/70 hover:text-crimson hover:underline"
      >
        Delete project
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h3 className="font-display text-lg font-bold text-ink">Delete &ldquo;{projectName}&rdquo;?</h3>
        <p className="mt-2 text-sm text-ink/60">
          This deletes every task inside it too, along with their log entries. This can&rsquo;t be
          undone.
        </p>
        <form action={formAction} className="mt-4 space-y-3">
          <input type="hidden" name="projectId" value={projectId} />
          <label className="block text-xs font-medium text-ink/50">
            Type <span className="font-semibold text-ink">{projectName}</span> to confirm
          </label>
          <input
            type="text"
            name="confirmName"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            autoComplete="off"
            className="w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-crimson focus:ring-2 focus:ring-crimson/10"
          />
          {state?.error && <p className="text-sm text-crimson">{state.error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="flex-1 rounded-md px-4 py-2 text-sm font-medium text-ink/60 hover:bg-tint"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={confirmName !== projectName}
              className="flex-1 rounded-md bg-crimson px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-crimson-bright disabled:opacity-40"
            >
              Delete project
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
