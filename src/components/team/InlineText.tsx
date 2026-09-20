"use client";

import { useState, useTransition } from "react";

/**
 * Click-to-edit text. Shows the value as a button; clicking swaps in an
 * input (or textarea) that saves on Enter / blur and cancels on Escape.
 */
export default function InlineText({
  value,
  onSave,
  display,
  className = "",
  inputClassName = "",
  placeholder = "Add…",
  multiline = false,
  editable = true,
  truncate = false,
  ariaLabel,
}: {
  value: string;
  onSave: (next: string) => Promise<{ error?: string } | void>;
  /** What to render when not editing (defaults to the raw value). */
  display?: React.ReactNode;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  multiline?: boolean;
  editable?: boolean;
  /** Ellipsize a too-long value instead of pushing the layout wider. */
  truncate?: boolean;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next === value.trim()) return;
    startTransition(async () => {
      const res = await onSave(next);
      if (res && "error" in res && res.error) {
        setError(res.error);
        setDraft(value);
      } else {
        setError(null);
      }
    });
  }

  if (editing) {
    const shared = {
      autoFocus: true,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.currentTarget.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
        if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
      },
      className:
        inputClassName ||
        "w-full rounded-md border border-navy/40 bg-surface px-2 py-1 text-sm text-ink outline-none focus:ring-2 focus:ring-navy/10",
    };
    return multiline ? <textarea rows={3} {...shared} /> : <input type="text" {...shared} />;
  }

  return (
    <span className={`items-center gap-1.5 ${truncate ? "flex min-w-0 max-w-full" : "inline-flex"}`}>
      <button
        type="button"
        disabled={!editable}
        onClick={() => {
          setDraft(value);
          setError(null);
          setEditing(true);
        }}
        title={editable ? (truncate ? value || undefined : "Click to edit") : truncate ? value || undefined : undefined}
        aria-label={ariaLabel}
        className={`text-left ${truncate ? "block min-w-0 max-w-full truncate" : ""} ${
          editable ? "hover:underline decoration-dotted underline-offset-2" : "cursor-default"
        } ${isPending ? "opacity-50" : ""} ${className}`}
      >
        {display ?? (value || <span className="text-ink/40">{placeholder}</span>)}
      </button>
      {error && <span className="flex-none text-xs text-crimson">{error}</span>}
    </span>
  );
}
