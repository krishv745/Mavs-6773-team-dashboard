"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { putBackOrphanAllocationAction } from "@/lib/bom/actions";

export default function PutBackOrphanButton({
  projectId,
  partId,
  qty,
}: {
  projectId: string;
  partId: string;
  qty: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await putBackOrphanAllocationAction(projectId, partId, qty);
          router.refresh();
        })
      }
      className="rounded-md bg-crimson px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-crimson-bright disabled:opacity-50"
    >
      {isPending ? "Putting back…" : `Put back ${qty} → inventory`}
    </button>
  );
}
