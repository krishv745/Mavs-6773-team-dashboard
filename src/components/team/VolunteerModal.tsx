"use client";

import { useActionState, useEffect, useRef } from "react";
import { volunteerAction } from "@/lib/events/actions";
import SubmitButton from "@/components/team/SubmitButton";

export type RoleOption = { id: string; name: string; slotsNeeded: number; filled: number };

export default function VolunteerModal({
  eventId,
  roles,
  hasFutureOccurrences,
}: {
  eventId: string;
  roles: RoleOption[];
  hasFutureOccurrences: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(volunteerAction, undefined);
  const onlyRole = roles.length === 1 ? roles[0] : null;

  useEffect(() => {
    if (state?.error) dialogRef.current?.showModal();
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white transition hover:bg-crimson-bright"
      >
        Volunteer
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
            <h2 className="font-display text-xl font-bold text-ink">Volunteer</h2>
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
            <input type="hidden" name="eventId" value={eventId} />

            {onlyRole ? (
              <input type="hidden" name="roleId" value={onlyRole.id} />
            ) : (
              <>
                <div>
                  <label htmlFor="v-role" className="text-sm font-medium text-ink/80">
                    Role
                  </label>
                  <select
                    id="v-role"
                    name="roleId"
                    required
                    defaultValue=""
                    className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                  >
                    <option value="" disabled>
                      Select a role
                    </option>
                    {roles.map((role) => {
                      const remaining = Math.max(0, role.slotsNeeded - role.filled);
                      return (
                        <option key={role.id} value={role.id} disabled={remaining === 0}>
                          {role.name} ({remaining === 0 ? "full" : `${remaining} spot${remaining === 1 ? "" : "s"} left`})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label htmlFor="v-notes" className="text-sm font-medium text-ink/80">
                    Notes (optional)
                  </label>
                  <textarea
                    id="v-notes"
                    name="notes"
                    rows={2}
                    className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                  />
                </div>
              </>
            )}

            {hasFutureOccurrences && (
              <label className="flex items-start gap-2 text-sm text-ink/70">
                <input type="checkbox" name="applyToSeries" value="true" className="mt-0.5" />
                Also sign me up for all future dates of this event
              </label>
            )}

            {state?.error && (
              <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
            )}

            <SubmitButton>Confirm</SubmitButton>
          </form>
        </div>
      </dialog>
    </>
  );
}
