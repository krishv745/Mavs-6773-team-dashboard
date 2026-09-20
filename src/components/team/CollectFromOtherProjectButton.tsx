"use client";

import { useTransition } from "react";
import { collectFromOtherProjectAction } from "@/lib/bom/actions";

/**
 * One "Collect N from X" pill per other project already holding this part —
 * next to a "for purchase" line's "buy N". Moves that many units straight
 * from the other project's allocation into this one, marks them collected
 * immediately, and reduces how much still needs to be ordered.
 */
export default function CollectFromOtherProjectButton({
  lineId,
  fromProjectId,
  fromProjectName,
  qty,
}: {
  lineId: string;
  fromProjectId: string;
  fromProjectName: string;
  qty: number;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      title={`Move ${qty} of these from ${fromProjectName} into this project and mark them collected`}
      onClick={() =>
        startTransition(async () => {
          await collectFromOtherProjectAction(lineId, fromProjectId, qty);
        })
      }
      className="rounded-full border border-navy/30 bg-navy/5 px-2.5 py-1 text-xs font-semibold text-navy transition hover:bg-navy/10 disabled:opacity-50"
    >
      {isPending ? "…" : `Collect ${qty} from ${fromProjectName}`}
    </button>
  );
}
