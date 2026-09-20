"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadFabricationFileAction } from "@/lib/bom/actions";

export default function FabricationUploadButton({
  subsystemId,
  category,
}: {
  subsystemId: string;
  category: "3d_print" | "custom_cut";
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onFile(file: File | null) {
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const res = await uploadFabricationFileAction(subsystemId, category, formData);
      if (inputRef.current) inputRef.current.value = "";
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
        className="rounded-md border border-hairline-strong bg-surface px-2.5 py-1 text-xs font-semibold text-ink/70 transition hover:bg-tint disabled:opacity-50"
      >
        {isPending ? "Uploading…" : "Upload file"}
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {error && <span className="text-xs text-crimson">{error}</span>}
    </span>
  );
}
