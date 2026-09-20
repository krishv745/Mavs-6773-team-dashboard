"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { cancelVolunteerRegistrationAction } from "@/lib/events/actions";
import SubmitButton from "@/components/team/SubmitButton";

export type MyRegistration = { id: string; roleName: string };

export default function RemoveRegistrationModal({
  registrations,
}: {
  registrations: MyRegistration[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(cancelVolunteerRegistrationAction, undefined);
  const [selectedId, setSelectedId] = useState(registrations[0]?.id ?? "");

  useEffect(() => {
    if (state?.error) dialogRef.current?.showModal();
  }, [state]);

  if (registrations.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="text-sm font-medium text-ink/50 transition hover:text-crimson"
      >
        Remove my registration
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl p-0 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="p-6">
          <div className="flex items-start justify-between">
            <h3 className="font-display text-lg font-bold text-ink">Cancel your sign-up</h3>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ink/40 hover:text-ink/70"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <form action={formAction} className="mt-4 space-y-4">
            {registrations.length > 1 ? (
              <div>
                <label htmlFor="r-registration" className="text-sm font-medium text-ink/80">
                  Which sign-up?
                </label>
                <select
                  id="r-registration"
                  name="volunteerId"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                >
                  {registrations.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.roleName}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input type="hidden" name="volunteerId" value={selectedId} />
            )}

            <div>
              <label htmlFor="r-reason" className="text-sm font-medium text-ink/80">
                Why are you cancelling?
              </label>
              <textarea
                id="r-reason"
                name="reason"
                required
                rows={3}
                placeholder="e.g. no longer free that day"
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>

            {state?.error && (
              <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
            )}

            <SubmitButton>Cancel sign-up</SubmitButton>
          </form>
        </div>
      </dialog>
    </>
  );
}
