"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markDisassemblyLineLostAction } from "@/lib/disassembly/actions";

/** Disassembly checklist's "Mark lost" — asks how many of what's still outstanding never came back. */
export default function MarkPartLostButton({ sessionLineId, remainingQty }: { sessionLineId: string; remainingQty: number }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [qty, setQty] = useState(remainingQty);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    setQty(remainingQty);
    setError(null);
    dialogRef.current?.showModal();
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await markDisassemblyLineLostAction(sessionLineId, qty);
      if (res.error) {
        setError(res.error);
        return;
      }
      dialogRef.current?.close();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="Mark some or all of this as lost, not returned"
        className="rounded-md border border-crimson/20 px-2 py-1 text-xs font-medium text-crimson/70 transition hover:bg-crimson/5 hover:text-crimson"
      >
        Mark lost
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-xs rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h3 className="font-display text-lg font-bold text-ink">Mark lost</h3>
        <p className="mt-2 text-sm text-ink/60">
          How many of the {remainingQty} still outstanding never came back? These come off the project&rsquo;s
          books for good — they won&rsquo;t go back into general stock.
        </p>
        <div className="mt-4 space-y-3">
          <input
            type="number"
            min={1}
            max={remainingQty}
            value={qty}
            disabled={isPending}
            onChange={(e) => setQty(Math.max(0, Math.round(Number(e.target.value) || 0)))}
            autoFocus
            className="w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-crimson focus:ring-2 focus:ring-crimson/10"
          />
          {error && <p className="text-sm text-crimson">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="flex-1 rounded-md px-4 py-2 text-sm font-medium text-ink/60 hover:bg-tint"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending || qty <= 0 || qty > remainingQty}
              onClick={submit}
              className="flex-1 rounded-md bg-crimson px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-crimson-bright disabled:opacity-40"
            >
              {isPending ? "Saving…" : "Mark lost"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
