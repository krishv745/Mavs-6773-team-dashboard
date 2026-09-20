"use client";

import { useRef, useState, useTransition } from "react";
import { assignCustomRoleAction } from "@/lib/customRoles/actions";
import { roleLabel } from "@/lib/roles";
import type { RoleRow, UserRole } from "@/lib/supabase/types";

const OWNER_GATED_TIERS: UserRole[] = ["team_lead", "owner"];

export default function RoleSelect({
  userId,
  name,
  currentRole,
  currentRoleId,
  roles,
  canEdit,
  canGrantOwnerGatedRoles,
}: {
  userId: string;
  name: string;
  currentRole: UserRole;
  currentRoleId: string | null;
  roles: RoleRow[];
  /** Can this viewer change roles at all — requires manage_members. */
  canEdit: boolean;
  canGrantOwnerGatedRoles: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<{ roleId: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentRoleRow = roles.find((r) => r.id === currentRoleId);
  const currentLabel = currentRoleRow?.name ?? roleLabel(currentRole);

  // Non-owner staff can only touch rows that are currently Member/Parent
  // tier, and can only choose a role mapped to Member/Parent — granting or
  // revoking Team Lead/Owner-tier access is Owner-only.
  const editable = canEdit && (canGrantOwnerGatedRoles || !OWNER_GATED_TIERS.includes(currentRole));
  const options = roles
    .filter((r) => canGrantOwnerGatedRoles || !OWNER_GATED_TIERS.includes(r.maps_to))
    .filter((r) => r.maps_to !== "owner" || r.is_system)
    .sort((a, b) => Number(b.is_system) - Number(a.is_system) || a.name.localeCompare(b.name));

  if (!editable) {
    return <span className="text-sm text-ink/60">{currentLabel}</span>;
  }

  function handleChange(roleId: string, label: string) {
    if (roleId === currentRoleId) return;
    setPending({ roleId, label });
    setError(null);
    dialogRef.current?.showModal();
  }

  function cancel() {
    setPending(null);
    setError(null);
    dialogRef.current?.close();
  }

  function confirm() {
    if (!pending) return;
    setError(null);
    startTransition(async () => {
      const result = await assignCustomRoleAction(userId, pending.roleId);
      if (result.error) setError(result.error);
      else dialogRef.current?.close();
    });
  }

  return (
    <>
      <select
        value={currentRoleId ?? ""}
        onChange={(e) => {
          const selected = e.target.options[e.target.selectedIndex];
          handleChange(e.target.value, selected.text);
        }}
        className="rounded-md border border-hairline-strong bg-surface px-2 py-1.5 text-xs outline-none focus:border-navy"
      >
        <optgroup label="Base roles">
          {options
            .filter((r) => r.is_system)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </optgroup>
        {options.some((r) => !r.is_system) && (
          <optgroup label="Custom roles">
            {options
              .filter((r) => !r.is_system)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </optgroup>
        )}
      </select>

      <dialog
        ref={dialogRef}
        className="w-full max-w-xs rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) cancel();
        }}
      >
        <h3 className="font-display text-base font-bold text-ink">Change {name}&rsquo;s role?</h3>
        <p className="mt-2 text-sm text-ink/60">
          {currentLabel} → <span className="font-semibold text-ink">{pending?.label ?? ""}</span>
        </p>
        {error && <p className="mt-2 text-xs text-crimson">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-ink/60 hover:bg-tint"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={isPending}
            className="rounded-md bg-crimson px-3 py-1.5 text-xs font-semibold text-white hover:bg-crimson-bright disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Confirm"}
          </button>
        </div>
      </dialog>
    </>
  );
}
