"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { putBackSurplusAction } from "@/lib/bom/actions";

export default function PutBackSurplusButton({ lineId, qty }: { lineId: string; qty: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await putBackSurplusAction(lineId);
          router.refresh();
        })
      }
      className="rounded-md bg-crimson px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-crimson-bright disabled:opacity-50"
    >
      {isPending ? "Putting back…" : `Put back ${qty} → inventory`}
    </button>
  );
}
