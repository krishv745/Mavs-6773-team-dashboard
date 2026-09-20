"use client";

import { useRef, useState, useTransition } from "react";
import { updateMemberFieldAction } from "@/lib/admin/actions";

export default function EditFieldButton({
  userId,
  field,
  value,
  label,
  inputType = "text",
}: {
  userId: string;
  field: "name" | "username" | "email" | "phone";
  value: string;
  label: string;
  inputType?: "text" | "email" | "tel";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    setDraft(value);
    setError(null);
    dialogRef.current?.showModal();
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateMemberFieldAction(userId, field, draft);
      if (result.error) setError(result.error);
      else dialogRef.current?.close();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={`Edit ${label}`}
        className="flex-none text-ink/30 hover:text-navy"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9" strokeLinecap="round" />
          <path
            d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-xs rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h3 className="font-display text-base font-bold text-ink capitalize">Edit {label}</h3>
        <input
          type={inputType}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          className="mt-3 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
        />
        {error && <p className="mt-2 text-xs text-crimson">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-ink/60 hover:bg-tint"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </dialog>
    </>
  );
}
