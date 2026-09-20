"use client";

import { useState, useTransition } from "react";
import { updateBomLineFieldAction } from "@/lib/bom/actions";

export default function BomLineTextField({
  lineId,
  field,
  value,
  label,
  canManageParts,
}: {
  lineId: string;
  field: "material" | "color";
  value: string | null;
  label: string;
  canManageParts: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await updateBomLineFieldAction(lineId, field, draft);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          disabled={isPending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder={label}
          className="w-24 rounded border border-hairline-strong px-1.5 py-0.5 text-xs outline-none focus:border-navy disabled:opacity-50"
        />
        <button type="button" disabled={isPending} onClick={save} className="text-xs font-semibold text-navy">
          {isPending ? "…" : "Save"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setDraft(value ?? "");
            setEditing(false);
          }}
          className="text-xs text-ink/40 hover:text-ink/70"
        >
          ✕
        </button>
      </span>
    );
  }

  if (!value) {
    return canManageParts ? (
      <button
        type="button"
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
        className="text-xs font-medium text-navy/70 hover:text-navy"
      >
        + Add {label.toLowerCase()}
      </button>
    ) : null;
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink/60">
      {value}
      {canManageParts && (
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          aria-label={`Edit ${label.toLowerCase()}`}
          className="text-ink/30 hover:text-navy"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 20h9" strokeLinecap="round" />
            <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </span>
  );
}
