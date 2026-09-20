"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { cancelVolunteerRegistrationAction, staffUpdateVolunteerRoleAction } from "@/lib/events/actions";
import SubmitButton from "@/components/team/SubmitButton";

export type RoleChoice = { id: string; name: string };

export default function StaffVolunteerControls({
  volunteerId,
  roleId,
  roles,
}: {
  volunteerId: string;
  roleId: string | null;
  roles: RoleChoice[];
}) {
  const [isPending, startTransition] = useTransition();
  const [roleError, setRoleError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [cancelState, cancelAction] = useActionState(cancelVolunteerRegistrationAction, undefined);

  useEffect(() => {
    if (cancelState?.error) dialogRef.current?.showModal();
  }, [cancelState]);

  function handleRoleChange(newRoleId: string) {
    setRoleError(null);
    startTransition(async () => {
      const result = await staffUpdateVolunteerRoleAction(volunteerId, newRoleId);
      if (result.error) setRoleError(result.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        defaultValue={roleId ?? ""}
        disabled={isPending}
        onChange={(e) => handleRoleChange(e.target.value)}
        className="rounded-md border border-hairline-strong bg-surface px-2 py-1 text-xs outline-none focus:border-navy disabled:opacity-50"
      >
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
      {roleError && <span className="text-xs text-crimson">{roleError}</span>}

      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="text-xs font-semibold text-ink/40 hover:text-crimson"
      >
        Cancel
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h3 className="font-display text-lg font-bold text-ink">Cancel this sign-up</h3>
        <form action={cancelAction} className="mt-4 space-y-4">
          <input type="hidden" name="volunteerId" value={volunteerId} />
          <div>
            <label htmlFor={`reason-${volunteerId}`} className="text-sm font-medium text-ink/80">
              Reason
            </label>
            <textarea
              id={`reason-${volunteerId}`}
              name="reason"
              required
              rows={3}
              placeholder="Why is this sign-up being cancelled?"
              className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
            />
          </div>
          {cancelState?.error && (
            <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{cancelState.error}</p>
          )}
          <SubmitButton>Cancel sign-up</SubmitButton>
        </form>
      </dialog>
    </div>
  );
}
