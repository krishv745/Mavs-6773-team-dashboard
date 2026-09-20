"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { manuallyReturnPartAction } from "@/lib/parts/actions";

export default function ManualReturnButton({
  projectId,
  partId,
  defaultQty,
}: {
  projectId: string;
  partId: string;
  defaultQty: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(defaultQty);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      await manuallyReturnPartAction(projectId, partId, qty);
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        title="Mark returned without scanning"
        onClick={() => {
          setQty(defaultQty);
          setEditing(true);
        }}
        className="rounded-md border border-hairline-strong px-2 py-1 text-xs font-medium text-ink/60 transition hover:bg-tint"
      >
        Mark returned
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        value={qty}
        disabled={isPending}
        onChange={(e) => setQty(Math.max(0, Math.round(Number(e.target.value) || 0)))}
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
