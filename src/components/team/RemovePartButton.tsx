"use client";

import { useRef } from "react";
import { deletePartAction } from "@/lib/parts/actions";

export default function RemovePartButton({ partId, name }: { partId: string; name: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const removeWithId = deletePartAction.bind(null, partId);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`Remove ${name}`}
        title="Remove part"
        className="text-ink/40 transition hover:text-crimson"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 11v6M14 11v6" strokeLinecap="round" />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h3 className="font-display text-lg font-bold text-ink">Remove {name}?</h3>
        <p className="mt-2 text-sm text-ink/60">
          This deletes the part from inventory along with its scan history and project
          allocations. This can&rsquo;t be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-md px-4 py-2 text-sm font-medium text-ink/60 hover:bg-tint"
          >
            Cancel
          </button>
          <form action={removeWithId}>
            <button
              type="submit"
              className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-bright"
            >
              Remove part
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
