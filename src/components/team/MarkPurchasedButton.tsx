"use client";

import { useTransition } from "react";
import { markLineAsPurchasedAction } from "@/lib/bom/actions";

export default function MarkPurchasedButton({ lineId }: { lineId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      title="Record that this was bought — restocks the part so it can be marked collected"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await markLineAsPurchasedAction(lineId);
        })
      }
      className="rounded-md border border-hairline-strong px-2 py-1 text-xs font-medium text-ink/60 transition hover:bg-tint disabled:opacity-50"
    >
      {isPending ? "…" : "Purchased"}
    </button>
  );
}
