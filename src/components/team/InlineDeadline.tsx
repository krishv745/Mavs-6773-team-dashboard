"use client";

import { useState, useTransition } from "react";
import { formatCalendarDate } from "@/lib/formatTime";
import { MAX_DEADLINE, deadlineError, minDeadline } from "@/lib/deadlines";

type SaveValue = string | "ongoing" | null;

/**
 * Click-to-edit deadline with three states: a date, "Ongoing" (no fixed end
 * date), or nothing set. Clicking opens an inline row with a date picker plus
 * Ongoing / Clear buttons.
 */
export default function InlineDeadline({
  deadline,
  ongoing,
  onSave,
  editable = true,
  compact = false,
  className = "",
  emptyLabel = "＋ date",
}: {
  deadline: string | null;
  ongoing: boolean;
  onSave: (value: SaveValue) => Promise<{ error?: string } | void>;
  editable?: boolean;
  compact?: boolean;
  className?: string;
  emptyLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Date inputs fire onChange mid-typing (e.g. year "0002" after one digit)
  // and on every scroll of a mobile date wheel, so the picked date is only
  // saved on Enter / Save — never straight from onChange. Typing and the
  // calendar both feed the same draft; min/max grey out out-of-range days in
  // the calendar, and deadlineError() catches anything typed outside them.
  const minDate = minDeadline();

  function saveDraft() {
    const draftError = deadlineError(draft);
    if (draftError) {
      setError(draftError);
      return;
    }
    if (draft === deadline && !ongoing) {
      setEditing(false);
      return;
    }
    save(draft);
  }

  function save(value: SaveValue) {
    setEditing(false);
    startTransition(async () => {
      const res = await onSave(value);
      setError(res && "error" in res && res.error ? res.error : null);
    });
  }

  const label = ongoing
    ? "Ongoing"
    : deadline
      ? formatCalendarDate(deadline, {
          month: "short",
          day: "numeric",
          year: compact ? undefined : "numeric",
        })
      : emptyLabel;

  if (editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <input
          type="date"
          autoFocus
          value={draft}
          min={minDate}
          max={MAX_DEADLINE}
          onChange={(e) => {
            setDraft(e.currentTarget.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveDraft();
            }
            if (e.key === "Escape") setEditing(false);
          }}
          className="rounded-md border border-navy/40 bg-surface px-2 py-1 text-xs text-ink outline-none focus:ring-2 focus:ring-navy/10"
        />
        <button
          type="button"
          onClick={saveDraft}
          disabled={!draft}
          className="rounded-md bg-crimson px-2 py-1 text-xs font-semibold text-white hover:bg-crimson-bright disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => save("ongoing")}
          className="rounded-md border border-hairline-strong bg-surface px-2 py-1 text-xs font-medium text-ink/70 hover:bg-tint"
        >
          Ongoing
        </button>
        {(deadline || ongoing) && (
          <button
            type="button"
            onClick={() => save(null)}
            className="rounded-md px-1.5 py-1 text-xs font-medium text-ink/40 hover:text-crimson"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md px-1.5 py-1 text-xs font-medium text-ink/40 hover:text-ink/70"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-crimson">{error}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={!editable}
        onClick={() => {
          setError(null);
          setDraft(deadline ?? "");
          setEditing(true);
        }}
        title={editable ? "Click to edit" : undefined}
        className={`${editable ? "decoration-dotted underline-offset-2 hover:underline" : "cursor-default"} ${
          isPending ? "opacity-50" : ""
        } ${className}`}
      >
        {label}
      </button>
      {error && <span className="text-xs text-crimson">{error}</span>}
    </span>
  );
}
