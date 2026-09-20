"use client";

import { useRef } from "react";
import { deleteEventAction } from "@/lib/events/actions";

export default function DeleteEventButton({
  eventId,
  eventName,
  label,
}: {
  eventId: string;
  eventName: string;
  /** Renders a labeled text button instead of the icon-only variant. */
  label?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deleteWithId = deleteEventAction.bind(null, eventId);

  return (
    <>
      {label ? (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="text-sm font-medium text-ink/40 hover:text-crimson"
        >
          {label}
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dialogRef.current?.showModal();
          }}
          title="Delete event"
          aria-label="Delete event"
          className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-ink/30 transition hover:bg-crimson/10 hover:text-crimson"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path
              d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0-1 13a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2L7 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h3 className="font-display text-lg font-bold text-ink">Delete &ldquo;{eventName}&rdquo;?</h3>
        <p className="mt-2 text-sm text-ink/60">
          Any volunteer sign-ups for it are removed too. This can&rsquo;t be undone.
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
              Delete event
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
