"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startDisassemblySessionAction } from "@/lib/disassembly/actions";

export default function StartDisassemblyButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const res = await startDisassemblySessionAction(projectId);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        disabled={isPending}
        onClick={handleStart}
        className="rounded-md bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-bright disabled:opacity-50"
      >
        {isPending ? "Starting…" : "Start disassembly"}
      </button>
      {error && <p className="mt-2 text-sm text-crimson">{error}</p>}
    </div>
  );
}
