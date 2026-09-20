"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  createCustomRoleAction,
  deleteCustomRoleAction,
  updateRolePermissionsAction,
} from "@/lib/customRoles/actions";
import { roleLabel } from "@/lib/roles";
import { PERMISSIONS } from "@/lib/permissions";
import type { RoleRow } from "@/lib/supabase/types";

function CreateRoleButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex-none rounded-md bg-crimson px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-crimson-bright disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create role"}
    </button>
  );
}

function EditPermissionsDialog({
  role,
  currentKeys,
  onClose,
}: {
  role: RoleRow;
  currentKeys: string[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(currentKeys));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateRolePermissionsAction(role.id, [...selected]);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-6">
        <h3 className="font-display text-lg font-bold text-ink">{role.name} permissions</h3>
        <p className="mt-1 text-xs text-ink/50">
          Maps to {roleLabel(role.maps_to)} for the handful of things that aren&rsquo;t permission-based
          (parent-only navigation, event visibility, etc).
        </p>

        <div className="mt-4 max-h-80 space-y-2.5 overflow-y-auto pr-1">
          {PERMISSIONS.map((p) => (
            <label key={p.key} className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={selected.has(p.key)}
                onChange={() => toggle(p.key)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-ink">{p.label}</span>
                <span className="block text-xs text-ink/50">{p.description}</span>
              </span>
            </label>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-crimson">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-md px-4 py-2 text-sm font-medium text-ink/60 hover:bg-tint disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-bright disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save permissions"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RolesPanel({
  roles,
  permissionsByRole,
  isOwner,
}: {
  roles: RoleRow[];
  permissionsByRole: Record<string, string[]>;
  isOwner: boolean;
}) {
  const [state, formAction] = useActionState(createCustomRoleAction, undefined);
  const [isDeleting, startDelete] = useTransition();
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);

  const sortedRoles = [...roles].sort(
    (a, b) => Number(b.is_system) - Number(a.is_system) || a.name.localeCompare(b.name),
  );

  return (
    <div className="mt-3 rounded-xl border border-hairline bg-surface p-5">
      <p className="text-sm text-ink/50">
        The Owner role always has every permission and can&rsquo;t be edited. Editing a role that maps to
        Team Lead is Owner-only.
      </p>

      <ul className="mt-3 space-y-2">
        {sortedRoles.map((r) => {
          const isOwnerRole = r.is_system && r.maps_to === "owner";
          const isTeamLeadTier = r.maps_to === "team_lead" || r.maps_to === "owner";
          const canEditThis = !isOwnerRole && (isOwner || !isTeamLeadTier);
          const permCount = r.is_system && r.maps_to === "owner" ? PERMISSIONS.length : (permissionsByRole[r.id] ?? []).length;
          return (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-hairline bg-tint/30 px-3 py-2 text-sm"
            >
              <span className="text-ink">
                {r.name}
                {r.is_system && (
                  <span className="ml-1.5 rounded-full bg-navy/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy">
                    Base
                  </span>
                )}
                <span className="ml-2 text-ink/40">
                  {permCount} permission{permCount === 1 ? "" : "s"}
                </span>
              </span>
              <div className="flex items-center gap-3">
                {canEditThis && (
                  <button
                    type="button"
                    onClick={() => setEditingRole(r)}
                    className="text-xs font-medium text-navy hover:underline"
                  >
                    Edit permissions
                  </button>
                )}
                {!r.is_system && (
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => startDelete(() => deleteCustomRoleAction(r.id))}
                    className="text-xs font-medium text-crimson/70 hover:text-crimson hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="roleName" className="text-xs font-medium text-ink/60">
            New role name
          </label>
          <input
            id="roleName"
            name="name"
            required
            placeholder="e.g. Mentor"
            className="mt-1 w-40 rounded-md border border-hairline-strong px-2.5 py-1.5 text-sm outline-none focus:border-navy"
          />
        </div>
        <div>
          <label htmlFor="mapsTo" className="text-xs font-medium text-ink/60">
            Starts like
          </label>
          <select
            id="mapsTo"
            name="mapsTo"
            defaultValue="member"
            className="mt-1 rounded-md border border-hairline-strong bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-navy"
          >
            <option value="member">{roleLabel("member")}</option>
            <option value="team_lead">{roleLabel("team_lead")}</option>
            <option value="parent">{roleLabel("parent")}</option>
          </select>
        </div>
        <CreateRoleButton />
      </form>
      {state?.error && <p className="mt-2 text-sm text-crimson">{state.error}</p>}

      {editingRole && (
        <EditPermissionsDialog
          role={editingRole}
          currentKeys={permissionsByRole[editingRole.id] ?? []}
          onClose={() => setEditingRole(null)}
        />
      )}
    </div>
  );
}
