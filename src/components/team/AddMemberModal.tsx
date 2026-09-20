"use client";

import { useActionState, useEffect, useRef } from "react";
import { addMemberAction } from "@/lib/admin/actions";
import PasswordField from "@/components/team/PasswordField";
import SubmitButton from "@/components/team/SubmitButton";

export default function AddMemberModal({ canAssignTeamLead }: { canAssignTeamLead: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(addMemberAction, undefined);

  useEffect(() => {
    if (state?.error) dialogRef.current?.showModal();
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy/90"
      >
        + Add member
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
            <h2 className="font-display text-xl font-bold text-ink">Add member</h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ink/40 hover:text-ink/70"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <p className="mt-1 text-sm text-ink/50">
            They&rsquo;ll sign in with this starter password, then be forced to set their own.
          </p>

          <form action={formAction} className="mt-5 space-y-4">
            <div>
              <label htmlFor="m-name" className="text-sm font-medium text-ink/80">
                Full name
              </label>
              <input
                id="m-name"
                name="name"
                required
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>
            <div>
              <label htmlFor="m-username" className="text-sm font-medium text-ink/80">
                Username
              </label>
              <input
                id="m-username"
                name="username"
                required
                pattern="[a-zA-Z0-9_.]+"
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>
            <div>
              <label htmlFor="m-role" className="text-sm font-medium text-ink/80">
                Role
              </label>
              <select
                id="m-role"
                name="role"
                defaultValue="member"
                className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              >
                <option value="member">Team member — full app access</option>
                <option value="parent">Parent — Events tab only</option>
                {canAssignTeamLead && (
                  <option value="team_lead">Team Lead — Admin Dashboard access</option>
                )}
              </select>
            </div>

            <PasswordField name="starterPassword" label="Starter password (8+ characters)" />

            {state?.error && (
              <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
            )}

            <SubmitButton>Create account</SubmitButton>
          </form>
        </div>
      </dialog>
    </>
  );
}
