"use client";

import { useState, useTransition } from "react";
import { manuallyCollectPurchaseLineAction } from "@/lib/bom/actions";

/**
 * On a "for purchase" line — marks a chosen quantity (not necessarily all
 * of it) as already in hand: goes straight into this project's inventory
 * allocation and counts as collected immediately, no separate order/restock
 * step. For when someone already has some sitting around or picked them up
 * without a formal purchase.
 */
export default function MarkPurchaseCollectedButton({
  lineId,
  maxQty,
}: {
  lineId: string;
  maxQty: number;
}) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(maxQty);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      await manuallyCollectPurchaseLineAction(lineId, qty);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        title="Mark some of these as already collected, without going through a purchase"
        onClick={() => {
          setQty(maxQty);
          setEditing(true);
        }}
        className="rounded-md border border-hairline-strong px-2 py-1 text-xs font-medium text-ink/60 transition hover:bg-tint"
      >
        Mark collected
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={1}
        max={maxQty}
        value={qty}
        disabled={isPending}
        onChange={(e) => setQty(Math.max(1, Math.min(maxQty, Math.round(Number(e.target.value) || 0))))}
        className="w-14 rounded-md border border-hairline-strong px-1.5 py-1 text-xs outline-none focus:border-navy"
      />
      <button
        type="button"
        disabled={isPending || qty <= 0}
        onClick={submit}
        className="rounded-md bg-navy px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "…" : "Go"}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setEditing(false)}
        className="text-xs text-ink/40 hover:text-ink/70"
        aria-label="Cancel"
      >
        ✕
      </button>
    </div>
  );
}
