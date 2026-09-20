"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction } from "@/lib/tasks/actions";
import SubmitButton from "@/components/team/SubmitButton";

export default function AddProjectModal({ variant = "card" }: { variant?: "card" | "button" }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(createProjectAction, undefined);

  useEffect(() => {
    if (state?.error) dialogRef.current?.showModal();
    if (state?.ok) {
      dialogRef.current?.close();
      router.refresh();
    }
  }, [state, router]);

  return (
    <>
      {variant === "button" ? (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="rounded-md bg-crimson px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-crimson-bright"
        >
          ＋ Add project
        </button>
      ) : (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="flex h-full min-h-[96px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-hairline-strong text-ink/40 transition hover:border-navy/30 hover:text-navy"
        >
          <span className="text-2xl leading-none">+</span>
          <span className="text-sm font-semibold">Add project</span>
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl p-0 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="p-6">
          <div className="flex items-start justify-between">
            <h2 className="font-display text-xl font-bold text-ink">Add project</h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ink/40 hover:text-ink/70"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <form action={formAction} className="mt-5 space-y-4">
            <div>
              <label htmlFor="p-name" className="text-sm font-medium text-ink/80">
                Project name
              </label>
              <input
                id="p-name"
                name="name"
                required
                placeholder="e.g. V1, Clubhouse Outreach Event"
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>

            <div>
              <label htmlFor="p-deadline" className="text-sm font-medium text-ink/80">
                Deadline (optional)
              </label>
              <input
                id="p-deadline"
                name="deadline"
                type="date"
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>

            {state?.error && (
              <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
            )}

            <SubmitButton>Create project</SubmitButton>
          </form>
        </div>
      </dialog>
    </>
  );
}
