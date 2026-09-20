"use client";

import { useState, useTransition } from "react";
import { summarizeReportAction } from "@/lib/admin/reportActions";

export default function SummarizeReportButton({
  start,
  end,
  personIds,
}: {
  start: string;
  end: string;
  personIds: string[];
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await summarizeReportAction(start, end, personIds);
      if (result.error) setError(result.error);
      else setSummary(result.summary ?? null);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white transition hover:bg-crimson-bright disabled:opacity-60"
      >
        {isPending ? "Summarizing…" : "✨ Summarize this range with AI"}
      </button>

      {error && <p className="mt-2 text-sm text-crimson">{error}</p>}
      {summary && (
        <div className="mt-3 rounded-xl border border-hairline bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-crimson">AI summary</p>
          <p className="mt-2 text-sm leading-relaxed text-ink/80">{summary}</p>
        </div>
      )}
    </div>
  );
}
