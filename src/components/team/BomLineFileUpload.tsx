"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBomLineFileAction, uploadBomLineFileAction } from "@/lib/bom/actions";
import { allowedBomFileExtensions } from "@/lib/bom/fileTypes";
import type { BomLineCategory } from "@/lib/supabase/types";

export default function BomLineFileUpload({
  lineId,
  category,
  files,
  canManageParts,
}: {
  lineId: string;
  category: BomLineCategory;
  files: { id: string; url: string; filename: string }[];
  canManageParts: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allowed = allowedBomFileExtensions(category);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const res = await uploadBomLineFileAction(lineId, formData);
      if (res.error) setError(res.error);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {files.map((f) => (
          <span
            key={f.id}
            className="inline-flex items-center gap-1 rounded-full bg-tint px-2 py-0.5 text-xs text-ink/70"
          >
            <a href={f.url} target="_blank" rel="noopener noreferrer" className="max-w-[10rem] truncate hover:underline">
              {f.filename}
            </a>
            {canManageParts && (
              <button
                type="button"
                aria-label={`Remove ${f.filename}`}
                onClick={() =>
                  startTransition(async () => {
                    await deleteBomLineFileAction(f.id);
                    router.refresh();
                  })
                }
                className="text-ink/30 hover:text-crimson"
              >
                ✕
              </button>
            )}
          </span>
        ))}
      </div>

      {canManageParts && (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
            className="mt-1 text-xs font-medium text-navy hover:underline disabled:opacity-50"
          >
            {isPending ? "Uploading…" : "+ Attach file"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={allowed?.join(",")}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <p className="mt-0.5 text-[11px] text-ink/40">{allowed?.join(", ")}</p>
        </>
      )}
      {error && <p className="mt-1 text-xs text-crimson">{error}</p>}
    </div>
  );
}
