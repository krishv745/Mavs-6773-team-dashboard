"use client";

import { useRef, useState, useTransition } from "react";
import { completeDisassemblySessionAction } from "@/lib/disassembly/actions";

export default function CompleteDisassemblyButton({
  sessionId,
  projectId,
  missingCount,
}: {
  sessionId: string;
  projectId: string;
  missingCount: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      const res = await completeDisassemblySessionAction(sessionId, projectId, note.trim() || null);
      if (res.error) {
        setError(res.error);
        return;
      }
      dialogRef.current?.close();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-bright"
      >
        Complete session
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h3 className="font-display text-lg font-bold text-ink">
          {missingCount > 0 ? `Close with ${missingCount} unit${missingCount === 1 ? "" : "s"} still missing?` : "Close this session?"}
        </h3>
        <p className="mt-2 text-sm text-ink/60">
          {missingCount > 0
            ? "The shortfall stays logged as a note on this session — inventory won't be zeroed out silently."
            : "Every expected part has been scanned back."}
        </p>
        {missingCount > 0 && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note — e.g. where the missing parts might be"
            rows={3}
            className="mt-3 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm outline-none focus:border-navy"
          />
        )}
        {error && <p className="mt-2 text-sm text-crimson">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-md px-4 py-2 text-sm font-medium text-ink/60 hover:bg-tint"
          >
            Keep looking
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={handleComplete}
            className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-bright disabled:opacity-50"
          >
            {isPending ? "Closing…" : "Close session"}
          </button>
        </div>
      </dialog>
    </>
  );
}
