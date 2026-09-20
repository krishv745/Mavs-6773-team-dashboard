"use client";

import { useTransition } from "react";
import { updateBomLineCollectedAction } from "@/lib/bom/actions";

export default function CollectedCheckbox({
  lineId,
  collected,
  label = "Collected",
}: {
  lineId: string;
  collected: boolean;
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-1.5 text-xs font-medium text-ink/70">
      <input
        type="checkbox"
        defaultChecked={collected}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.checked;
          startTransition(async () => {
            await updateBomLineCollectedAction(lineId, next);
          });
        }}
        className="h-4 w-4 rounded border-hairline-strongest text-navy focus:ring-navy/30"
      />
      {label}
    </label>
  );
}
