"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renameBuildProjectAction } from "@/lib/parts/actions";
import { renameSubsystemAction } from "@/lib/subsystems/actions";

type Props = { currentName: string } & (
  | { kind: "project"; projectId: string }
  | { kind: "subsystem"; subsystemId: string }
);

const TITLE = { project: "Rename project", subsystem: "Rename subsystem" } as const;

export default function RenameBuildEntityButton(props: Props) {
  const { kind, currentName } = props;
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    setName(currentName);
    setError(null);
    dialogRef.current?.showModal();
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) {
      dialogRef.current?.close();
      return;
    }
    setError(null);
    startTransition(async () => {
      const res =
        props.kind === "project"
          ? await renameBuildProjectAction(props.projectId, trimmed)
          : await renameSubsystemAction(props.subsystemId, trimmed);
      if (res.error) {
        setError(res.error);
        return;
      }
      dialogRef.current?.close();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        title={TITLE[kind]}
        aria-label={TITLE[kind]}
        className="flex h-6 w-6 flex-none items-center justify-center rounded text-ink/30 transition hover:bg-tint hover:text-ink/70"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path
            d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
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
        <h3 className="font-display text-lg font-bold text-ink">{TITLE[kind]}</h3>
        <div className="mt-4 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !isPending && submit()}
            autoFocus
            className="w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
          />
          {error && <p className="text-sm text-crimson">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="flex-1 rounded-md px-4 py-2 text-sm font-medium text-ink/60 hover:bg-tint"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending || !name.trim()}
              onClick={submit}
              className="flex-1 rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-navy/90 disabled:opacity-40"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
