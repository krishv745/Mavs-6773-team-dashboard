"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import EditFieldButton from "@/components/team/EditFieldButton";
import EditPasswordButton from "@/components/team/EditPasswordButton";
import RoleSelect from "@/components/team/RoleSelect";
import DeleteMemberButton from "@/components/team/DeleteMemberButton";
import { roleLabel } from "@/lib/roles";
import type { RoleRow, UserRole } from "@/lib/supabase/types";

export type MemberRow = {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  role: UserRole;
  roleId: string | null;
  hoursThisWeek: string;
  allTimeHours: string;
  flagged: boolean;
};

type ColumnKey = "member" | "username" | "email" | "phone" | "role" | "hoursThisWeek" | "allTimeHours" | "actions";

const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "member", label: "Member" },
  { key: "username", label: "Username" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "role", label: "Role" },
  { key: "hoursThisWeek", label: "Hours this week" },
  { key: "allTimeHours", label: "All-time hours" },
  { key: "actions", label: "Actions" },
];

const ROLES: UserRole[] = ["member", "parent", "team_lead", "owner"];

const COLUMNS_STORAGE_KEY = "tt-admin-hours-hidden-columns";
const ROLES_STORAGE_KEY = "tt-admin-hours-hidden-roles";

function useClosePopoverOnOutsideClick(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  setOpen: (open: boolean) => void,
) {
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, ref, setOpen]);
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5h16l-6 8v6l-4-2v-4L4 5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return crossed ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 3l18 18" strokeLinecap="round" />
      <path
        d="M10.6 5.1A10.9 10.9 0 0112 5c5.5 0 9 4.6 10 7-.4.9-1.1 2-2.1 3.1M6.3 6.4C4.5 7.7 3.1 9.6 2 12c1 2.4 4.5 7 10 7 1.4 0 2.7-.3 3.8-.8M9.5 9.9a3 3 0 004.2 4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12c1-2.4 4.5-7 10-7s9 4.6 10 7c-1 2.4-4.5 7-10 7s-9-4.6-10-7z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </svg>
  );
}

export default function MemberHoursTable({
  rows,
  currentUserId,
  isOwner,
  canManageMembers,
  roles,
}: {
  rows: MemberRow[];
  currentUserId: string;
  isOwner: boolean;
  canManageMembers: boolean;
  roles: RoleRow[];
}) {
  const [revealUsernames, setRevealUsernames] = useState(false);
  const [hidden, setHidden] = useState<Set<ColumnKey>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const [hiddenRoles, setHiddenRoles] = useState<Set<UserRole>>(new Set());
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const rolePickerRef = useRef<HTMLDivElement>(null);

  // Restore which columns/roles are hidden after mount — read (and thus the
  // resulting DOM) has to happen post-hydration, since the server has no
  // access to localStorage and would otherwise render a different set of
  // columns/rows than the client's first paint.
  useEffect(() => {
    try {
      const savedColumns = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage, which only exists client-side and can't be read during the (possibly server) initial render
      if (savedColumns) setHidden(new Set(JSON.parse(savedColumns) as ColumnKey[]));
    } catch {
      // ignore malformed/inaccessible storage
    }
    try {
      const savedRoles = window.localStorage.getItem(ROLES_STORAGE_KEY);
      if (savedRoles) setHiddenRoles(new Set(JSON.parse(savedRoles) as UserRole[]));
    } catch {
      // ignore malformed/inaccessible storage
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...hidden]));
    } catch {
      // ignore inaccessible storage
    }
  }, [hidden]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify([...hiddenRoles]));
    } catch {
      // ignore inaccessible storage
    }
  }, [hiddenRoles]);

  useClosePopoverOnOutsideClick(pickerRef, pickerOpen, setPickerOpen);
  useClosePopoverOnOutsideClick(rolePickerRef, rolePickerOpen, setRolePickerOpen);

  function toggleColumn(key: ColumnKey) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleRole(role: UserRole) {
    setHiddenRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  const show = (key: ColumnKey) => !hidden.has(key);
  const visibleRows = rows.filter((u) => !hiddenRoles.has(u.role));

  return (
    <div>
      <div className="mb-2 flex justify-end gap-2">
        <div className="relative" ref={rolePickerRef}>
          <button
            type="button"
            onClick={() => setRolePickerOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-md border border-hairline-strong bg-surface px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-tint"
          >
            <FilterIcon /> Roles
            {hiddenRoles.size > 0 && (
              <span className="rounded-full bg-navy/10 px-1.5 py-0.5 text-[10px] font-bold text-navy">
                {ROLES.length - hiddenRoles.size}/{ROLES.length}
              </span>
            )}
          </button>
          {rolePickerOpen && (
            <div className="absolute right-0 z-10 mt-1.5 w-48 rounded-md border border-hairline-strong bg-surface p-2 shadow-lg">
              {ROLES.map((role) => (
                <label
                  key={role}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-ink/70 hover:bg-tint"
                >
                  <input
                    type="checkbox"
                    checked={!hiddenRoles.has(role)}
                    onChange={() => toggleRole(role)}
                  />
                  {roleLabel(role)}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-md border border-hairline-strong bg-surface px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-tint"
          >
            <ColumnsIcon /> Columns
          </button>
          {pickerOpen && (
            <div className="absolute right-0 z-10 mt-1.5 w-52 rounded-md border border-hairline-strong bg-surface p-2 shadow-lg">
              {COLUMNS.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-ink/70 hover:bg-tint"
                >
                  <input type="checkbox" checked={show(col.key)} onChange={() => toggleColumn(col.key)} />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-hairline bg-tint/60 text-xs uppercase tracking-wide text-ink/50">
            <tr>
              {show("member") && <th className="px-4 py-3 font-semibold">Member</th>}
              {show("username") && (
                <th className="px-4 py-3 font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    Username
                    <button
                      type="button"
                      onClick={() => setRevealUsernames((v) => !v)}
                      aria-label={revealUsernames ? "Hide usernames" : "Reveal usernames"}
                      className="normal-case text-ink/40 hover:text-navy"
                    >
                      <EyeIcon crossed={revealUsernames} />
                    </button>
                  </span>
                </th>
              )}
              {show("email") && <th className="px-4 py-3 font-semibold">Email</th>}
              {show("phone") && <th className="px-4 py-3 font-semibold">Phone</th>}
              {show("role") && <th className="px-4 py-3 font-semibold">Role</th>}
              {show("hoursThisWeek") && <th className="px-4 py-3 font-semibold">Hours this week</th>}
              {show("allTimeHours") && <th className="px-4 py-3 font-semibold">All-time hours</th>}
              {show("actions") && <th className="px-4 py-3 font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length - hidden.size} className="px-4 py-8 text-center text-sm text-ink/40">
                  No members match the current role filter.
                </td>
              </tr>
            )}
            {visibleRows.map((u) => (
              <tr key={u.id} className="border-b border-hairline last:border-0">
                {show("member") && (
                  <td className="px-4 py-3 font-medium text-ink">
                    <span className="inline-flex items-center gap-1.5">
                      <Link href={`/team/admin/members/${u.id}`} className="hover:underline">
                        {u.name}
                      </Link>
                      {canManageMembers && (
                        <EditFieldButton userId={u.id} field="name" value={u.name} label="name" />
                      )}
                    </span>
                  </td>
                )}
                {show("username") && (
                  <td className="px-4 py-3 text-ink/60">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-mono tracking-wide">
                        {revealUsernames ? u.username : "•".repeat(Math.max(u.username.length, 6))}
                      </span>
                      {canManageMembers && (
                        <EditFieldButton userId={u.id} field="username" value={u.username} label="username" />
                      )}
                    </span>
                  </td>
                )}
                {show("email") && (
                  <td className="px-4 py-3 text-ink/60">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="truncate">{u.email}</span>
                      {canManageMembers && (
                        <EditFieldButton userId={u.id} field="email" value={u.email} label="email" inputType="email" />
                      )}
                    </span>
                  </td>
                )}
                {show("phone") && (
                  <td className="px-4 py-3 text-ink/60">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="truncate">{u.phone || "—"}</span>
                      {canManageMembers && (
                        <EditFieldButton userId={u.id} field="phone" value={u.phone} label="phone" inputType="tel" />
                      )}
                    </span>
                  </td>
                )}
                {show("role") && (
                  <td className="px-4 py-3">
                    <RoleSelect
                      userId={u.id}
                      name={u.name}
                      currentRole={u.role}
                      currentRoleId={u.roleId}
                      roles={roles}
                      canEdit={canManageMembers}
                      canGrantOwnerGatedRoles={isOwner}
                    />
                  </td>
                )}
                {show("hoursThisWeek") && (
                  <td className={`px-4 py-3 ${u.flagged && u.role !== "parent" ? "font-semibold text-crimson" : "text-ink/70"}`}>
                    {u.role === "parent" ? "—" : `${u.hoursThisWeek}h`}
                  </td>
                )}
                {show("allTimeHours") && (
                  <td className="px-4 py-3 text-ink/70">{u.role === "parent" ? "—" : `${u.allTimeHours}h`}</td>
                )}
                {show("actions") && (
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      {canManageMembers && <EditPasswordButton userId={u.id} name={u.name} />}
                      {isOwner && u.id !== currentUserId && <DeleteMemberButton userId={u.id} name={u.name} />}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
