"use client";

import { useState, useTransition } from "react";
import { backfillPartCostsAction } from "@/lib/parts/actions";

export default function BackfillCostsButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ checked: number; updated: number; error?: string } | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await backfillPartCostsAction();
      setResult(res);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md border border-hairline-strong bg-surface px-4 py-2 text-sm font-semibold text-ink/70 transition hover:bg-tint disabled:opacity-50"
      >
        {isPending ? "Fetching costs…" : "Fetch missing costs"}
      </button>
      {result && (
        <span className="text-xs text-ink/50">
          {result.error ? result.error : `Checked ${result.checked}, updated ${result.updated}`}
        </span>
      )}
    </div>
  );
}
