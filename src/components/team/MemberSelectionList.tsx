"use client";

import { useState } from "react";
import { roleLabel } from "@/lib/roles";
import type { UserRole } from "@/lib/supabase/types";

export type SelectableMember = { id: string; name: string; role: UserRole };

/** Checkbox roster with search, "Select all", and "Select all <Role>" shortcuts, shared by task assignment and event volunteer assignment. */
export default function MemberSelectionList({
  members,
  checked,
  onChange,
  name,
  maxHeightClassName = "max-h-48",
}: {
  members: SelectableMember[];
  checked: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Form field name — pass when this list submits via a native <form>. */
  name?: string;
  maxHeightClassName?: string;
}) {
  const [search, setSearch] = useState("");
  const roles = [...new Set(members.map((m) => m.role))];
  const trimmedSearch = search.trim().toLowerCase();
  const visibleMembers = trimmedSearch ? members.filter((m) => m.name.toLowerCase().includes(trimmedSearch)) : members;
  const allSelected = visibleMembers.length > 0 && visibleMembers.every((m) => checked.has(m.id));
  // Checked members hidden by the current search still need to submit with the form.
  const hiddenChecked = [...checked].filter((id) => !visibleMembers.some((m) => m.id === id));

  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function selectAllOrClear() {
    const next = new Set(checked);
    for (const m of visibleMembers) {
      if (allSelected) next.delete(m.id);
      else next.add(m.id);
    }
    onChange(next);
  }

  function selectRole(role: UserRole) {
    const next = new Set(checked);
    for (const m of visibleMembers) if (m.role === role) next.add(m.id);
    onChange(next);
  }

  if (members.length === 0) {
    return <p className="px-1 py-1 text-sm text-ink/40">No members found.</p>;
  }

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search members..."
        className="w-full rounded-md border border-hairline-strong px-2.5 py-1.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
      />

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={selectAllOrClear}
          className="rounded-full border border-hairline-strong px-2.5 py-1 text-xs font-medium text-ink/70 hover:bg-tint"
        >
          {allSelected ? "Clear all" : "Select all"}
        </button>
        {roles.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => selectRole(role)}
            className="rounded-full border border-hairline-strong px-2.5 py-1 text-xs font-medium text-ink/70 hover:bg-tint"
          >
            All {roleLabel(role)}s
          </button>
        ))}
      </div>

      <div className={`mt-1.5 ${maxHeightClassName} space-y-1 overflow-y-auto rounded-md border border-hairline-strong p-2`}>
        {visibleMembers.length === 0 ? (
          <p className="px-1 py-1 text-sm text-ink/40">No members match &ldquo;{search.trim()}&rdquo;.</p>
        ) : (
          visibleMembers.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm text-ink/80 hover:bg-tint"
            >
              <input type="checkbox" name={name} value={m.id} checked={checked.has(m.id)} onChange={() => toggle(m.id)} />
              {m.name}
            </label>
          ))
        )}
        {name && hiddenChecked.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      </div>
    </div>
  );
}
