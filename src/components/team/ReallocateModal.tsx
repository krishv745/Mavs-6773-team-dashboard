"use client";

import { useActionState, useEffect, useRef } from "react";
import { reallocateAction } from "@/lib/parts/actions";
import { GENERAL_INVENTORY_ID } from "@/lib/parts/constants";
import SubmitButton from "@/components/team/SubmitButton";
import type { PartRow, ProjectRow } from "@/lib/supabase/types";

export default function ReallocateModal({ parts, projects }: { parts: PartRow[]; projects: ProjectRow[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(reallocateAction, undefined);

  useEffect(() => {
    if (state?.error) dialogRef.current?.showModal();
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md border border-hairline-strong bg-surface px-4 py-2 text-sm font-semibold text-ink/70 transition hover:bg-tint"
      >
        Manual reallocation
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl p-0 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="p-6">
          <div className="flex items-start justify-between">
            <h2 className="font-display text-xl font-bold text-ink">Manual reallocation</h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ink/40 hover:text-ink/70"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <p className="mt-1 text-sm text-ink/50">No scanning — move allocation directly.</p>

          <form action={formAction} className="mt-5 space-y-4">
            <div>
              <label htmlFor="partId" className="text-sm font-medium text-ink/80">
                Part
              </label>
              <select
                id="partId"
                name="partId"
                required
                defaultValue=""
                className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              >
                <option value="" disabled>
                  Select a part
                </option>
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="fromProjectId" className="text-sm font-medium text-ink/80">
                  From project
                </label>
                <select
                  id="fromProjectId"
                  name="fromProjectId"
                  defaultValue=""
                  className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                >
                  <option value="">Unallocated</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="toProjectId" className="text-sm font-medium text-ink/80">
                  To project
                </label>
                <select
                  id="toProjectId"
                  name="toProjectId"
                  required
                  defaultValue=""
                  className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                >
                  <option value="" disabled>
                    Select
                  </option>
                  <option value={GENERAL_INVENTORY_ID}>General inventory (back to stock)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="qty" className="text-sm font-medium text-ink/80">
                Quantity
              </label>
              <input
                id="qty"
                name="qty"
                type="number"
                min={1}
                defaultValue={1}
                required
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>

            {state?.error && (
              <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
            )}

            <SubmitButton>Move allocation</SubmitButton>
          </form>
        </div>
      </dialog>
    </>
  );
}
