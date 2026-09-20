"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteBuildProjectAction } from "@/lib/parts/actions";
import { deleteSubsystemAction } from "@/lib/subsystems/actions";
import type { PartHold } from "@/lib/build/types";

type Props = {
  name: string;
  /** Parts still checked out, as of this render — the action re-checks before deleting. */
  holds: PartHold[];
} & (
  | { kind: "project"; projectId: string }
  | { kind: "subsystem"; subsystemId: string; projectId: string }
);

const COPY = {
  project: {
    button: "Delete project",
    cascade:
      "This deletes its subsystems, their imported BOMs, and every attached fabrication file. This can’t be undone.",
    blockedLead: (n: number) =>
      `${n} part${n === 1 ? " is" : "s are"} still checked out to this project — deleting it now would drop those units from the inventory count for good.`,
    blockedHint:
      "Run a disassembly to check them all back in, or use the board’s “Put back” buttons. The delete unlocks once nothing is left allocated.",
  },
  subsystem: {
    button: "Delete subsystem",
    cascade: "This deletes its imported BOM and every attached fabrication file. This can’t be undone.",
    blockedLead: (n: number) =>
      `${n} part${n === 1 ? " is" : "s are"} still collected against this subsystem — deleting it now would leave the project holding stock nothing accounts for.`,
    blockedHint:
      "Return them line by line from the COTS checklist (the − button offers “return & remove”), or disassemble the whole project. The delete unlocks once nothing is left collected.",
  },
} as const;

export default function DeleteBuildEntityButton(props: Props) {
  const { kind, name } = props;
  const copy = COPY[kind];
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [holds, setHolds] = useState(props.holds);
  const [isPending, startTransition] = useTransition();

  const blocked = holds.length > 0;
  const heldUnits = holds.reduce((sum, h) => sum + h.qty, 0);

  function open() {
    setConfirmName("");
    setError(null);
    setHolds(props.holds);
    dialogRef.current?.showModal();
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res =
        props.kind === "project"
          ? await deleteBuildProjectAction(props.projectId, confirmName)
          : await deleteSubsystemAction(props.subsystemId);

      // A concurrent collect can put parts back on the hold list between this
      // render and the click — show what the action found rather than a bare error.
      if (res.holds?.length) setHolds(res.holds);
      if (res.error) {
        setError(res.error);
        return;
      }
      dialogRef.current?.close();
      router.push(props.kind === "project" ? "/team/build" : `/team/build/project/${props.projectId}`);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="rounded-md border border-crimson/30 bg-surface px-3 py-2 text-sm font-semibold text-crimson transition hover:bg-crimson/5"
      >
        {copy.button}
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h3 className="font-display text-lg font-bold text-ink">Delete &ldquo;{name}&rdquo;?</h3>

        {blocked ? (
          <>
            <p className="mt-2 text-sm text-ink/60">{copy.blockedLead(heldUnits)}</p>
            <p className="mt-2 text-sm text-ink/60">{copy.blockedHint}</p>
            <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-crimson/20 bg-crimson/5 p-2">
              {holds.map((h, i) => (
                <li
                  key={`${h.partId ?? h.name}-${i}`}
                  className="flex items-center justify-between gap-3 px-1.5 py-1 text-sm"
                >
                  <span className="min-w-0 truncate text-ink">{h.name}</span>
                  <span className="flex-none font-semibold text-crimson">{h.qty}</span>
                </li>
              ))}
            </ul>
            {error && <p className="mt-3 text-sm text-crimson">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="flex-1 rounded-md px-4 py-2 text-sm font-medium text-ink/60 hover:bg-tint"
              >
                Close
              </button>
              <Link
                href={`/team/build/disassemble/${props.projectId}`}
                className="flex-1 rounded-md bg-navy px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-navy/90"
              >
                Disassemble
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink/60">{copy.cascade}</p>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-ink/50">
                Type <span className="font-semibold text-ink">{name}</span> to confirm
              </label>
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && confirmName === name && !isPending) handleDelete();
                }}
                autoComplete="off"
                className="w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-crimson focus:ring-2 focus:ring-crimson/10"
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
                  disabled={confirmName !== name || isPending}
                  onClick={handleDelete}
                  className="flex-1 rounded-md bg-crimson px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-crimson-bright disabled:opacity-40"
                >
                  {isPending ? "Deleting…" : copy.button}
                </button>
              </div>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
