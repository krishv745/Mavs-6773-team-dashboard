"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBomLineAction } from "@/lib/bom/actions";

export default function DeleteBomLineButton({
  lineId,
  collectedQty = 0,
}: {
  lineId: string;
  /** Units already collected against this line — if > 0, deleting prompts to return them first. */
  collectedQty?: number;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();

  function run(returnCollected: boolean) {
    startTransition(async () => {
      const res = await deleteBomLineAction(lineId, returnCollected);
      dialogRef.current?.close();
      if (res.needsReturnConfirm) {
        dialogRef.current?.showModal();
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        title="Remove this line"
        aria-label="Remove this line"
        disabled={isPending}
        onClick={() => (collectedQty > 0 ? dialogRef.current?.showModal() : run(false))}
        className="flex h-6 w-6 flex-none items-center justify-center rounded text-ink/30 transition hover:bg-crimson/10 hover:text-crimson disabled:opacity-50"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12h14" strokeLinecap="round" />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h3 className="font-display text-lg font-bold text-ink">Return collected parts?</h3>
        <p className="mt-2 text-sm text-ink/60">
          {collectedQty} part{collectedQty === 1 ? " is" : "s are"} already collected against this line and allocated
          to the project. Return {collectedQty === 1 ? "it" : "them"} to general inventory and remove the line?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => dialogRef.current?.close()}
            className="rounded-md px-4 py-2 text-sm font-medium text-ink/60 hover:bg-tint"
          >
            No, keep it
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(true)}
            className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-bright disabled:opacity-50"
          >
            {isPending ? "Returning…" : "Yes, return & remove"}
          </button>
        </div>
      </dialog>
    </>
  );
}
