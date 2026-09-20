"use client";

import { useRef } from "react";
import { deleteClockSessionAction } from "@/lib/admin/actions";

export default function DeleteClockSessionButton({
  sessionId,
  dateLabel,
  durationLabel,
}: {
  sessionId: string;
  dateLabel: string;
  durationLabel: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deleteWithId = deleteClockSessionAction.bind(null, sessionId);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="text-xs font-medium text-crimson/70 hover:text-crimson hover:underline"
      >
        Delete
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h3 className="font-display text-lg font-bold text-ink">Delete this session?</h3>
        <p className="mt-2 text-sm text-ink/60">
          {dateLabel} · {durationLabel}. This removes it from their hour totals. This can&rsquo;t be undone.
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
              Delete
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
