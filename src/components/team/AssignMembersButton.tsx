"use client";

import { useRef, useState, useTransition } from "react";
import MemberSelectionList, { type SelectableMember } from "@/components/team/MemberSelectionList";

export type AssignableMember = SelectableMember;

/** Assign-people dialog shared by tasks and projects — the caller supplies the save action. */
export default function AssignMembersButton({
  members,
  assignedIds,
  onSave,
  title = "Assign members",
  variant = "text",
}: {
  members: AssignableMember[];
  assignedIds: string[];
  onSave: (userIds: string[]) => Promise<{ error?: string } | void>;
  title?: string;
  /** "text" link or "icon" small pencil. */
  variant?: "text" | "icon";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set(assignedIds));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    setChecked(new Set(assignedIds));
    setError(null);
    dialogRef.current?.showModal();
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await onSave([...checked]);
      if (result && "error" in result && result.error) setError(result.error);
      else dialogRef.current?.close();
    });
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={open}
          title={assignedIds.length > 0 ? "Show / edit assignees" : "Assign members"}
          aria-label={assignedIds.length > 0 ? "Show or edit assignees" : "Assign members"}
          className="flex h-6 w-6 flex-none items-center justify-center rounded-md border border-hairline-strong bg-surface text-ink/40 transition hover:border-navy hover:text-navy"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <button type="button" onClick={open} className="text-xs font-medium text-navy hover:underline">
          {assignedIds.length > 0 ? "Edit assignees" : "Assign members"}
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="w-full max-w-xs rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
        <div className="mt-3">
          <MemberSelectionList members={members} checked={checked} onChange={setChecked} maxHeightClassName="max-h-56" />
        </div>
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
