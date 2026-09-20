"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { staffAssignVolunteerAction } from "@/lib/events/actions";
import SubmitButton from "@/components/team/SubmitButton";
import MemberSelectionList, { type SelectableMember } from "@/components/team/MemberSelectionList";

export type AssignableRole = { id: string; name: string };
export type AssignableMember = SelectableMember;

export default function AssignVolunteerModal({
  eventId,
  roles,
  members,
  hasFutureOccurrences,
}: {
  eventId: string;
  roles: AssignableRole[];
  members: AssignableMember[];
  hasFutureOccurrences: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(staffAssignVolunteerAction, undefined);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showWalkIn, setShowWalkIn] = useState(false);
  const onlyRole = roles.length === 1 ? roles[0] : null;

  useEffect(() => {
    if (state?.error) dialogRef.current?.showModal();
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="text-sm font-semibold text-navy hover:underline"
      >
        + Assign volunteer
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl p-0 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="flex items-start justify-between">
            <h2 className="font-display text-xl font-bold text-ink">Assign volunteer</h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ink/40 hover:text-ink/70"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          {roles.length > 1 && (
            <p className="mt-1 text-xs text-ink/50">One role per assignment — repeat this for other roles.</p>
          )}

          <form action={formAction} className="mt-5 space-y-4">
            <input type="hidden" name="eventId" value={eventId} />

            {onlyRole ? (
              <input type="hidden" name="roleId" value={onlyRole.id} />
            ) : (
              <div>
                <label htmlFor="a-role" className="text-sm font-medium text-ink/80">
                  Role
                </label>
                <select
                  id="a-role"
                  name="roleId"
                  required
                  defaultValue=""
                  className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                >
                  <option value="" disabled>
                    Select a role
                  </option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-ink/80">Who&rsquo;s in</p>
              <MemberSelectionList members={members} checked={checked} onChange={setChecked} name="userIds" />
              <p className="mt-1 text-xs text-ink/40">{checked.size} selected</p>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowWalkIn((v) => !v)}
                className="text-xs font-semibold text-navy hover:underline"
              >
                {showWalkIn ? "− Remove walk-in" : "+ Add someone without an account"}
              </button>
              {showWalkIn && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    name="walkInName"
                    placeholder="Name"
                    className="rounded-md border border-hairline-strong px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                  />
                  <input
                    name="walkInEmail"
                    type="email"
                    placeholder="Email"
                    className="rounded-md border border-hairline-strong px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                  />
                </div>
              )}
            </div>

            {roles.length > 1 && (
              <div>
                <label htmlFor="a-notes" className="text-sm font-medium text-ink/80">
                  Notes (optional)
                </label>
                <textarea
                  id="a-notes"
                  name="notes"
                  rows={2}
                  className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                />
              </div>
            )}

            {hasFutureOccurrences && (
              <div>
                <p className="text-sm font-medium text-ink/80">Apply to</p>
                <div className="mt-1.5 space-y-1.5">
                  <label className="flex items-center gap-2 text-sm text-ink/70">
                    <input type="radio" name="applyToSeries" value="false" defaultChecked />
                    This event only
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink/70">
                    <input type="radio" name="applyToSeries" value="true" />
                    This and all future events in the series
                  </label>
                </div>
              </div>
            )}

            {state?.error && (
              <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
            )}

            <SubmitButton>Assign</SubmitButton>
          </form>
        </div>
      </dialog>
    </>
  );
}
