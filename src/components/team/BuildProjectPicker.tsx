"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction } from "@/lib/parts/actions";
import type { ProjectRow } from "@/lib/supabase/types";

const NEW_PROJECT = "__new__";

export default function BuildProjectPicker({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!newName.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await createProjectAction(newName.trim());
      if (res.error || !res.id) {
        setError(res.error ?? "Couldn't create that project.");
        return;
      }
      setCreating(false);
      setNewName("");
      router.push(`/team/build/project/${res.id}`);
    });
  }

  if (creating) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="New project name"
          className="w-40 rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm outline-none focus:border-navy"
        />
        <button
          type="button"
          disabled={isPending || !newName.trim()}
          onClick={handleCreate}
          className="flex-none rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {isPending ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={() => {
            setCreating(false);
            setError(null);
          }}
          className="flex-none text-xs font-medium text-ink/40 hover:text-ink/70"
        >
          Cancel
        </button>
        {error && <p className="text-xs text-crimson">{error}</p>}
      </div>
    );
  }

  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value === NEW_PROJECT) setCreating(true);
        else if (e.target.value) router.push(`/team/build/project/${e.target.value}`);
      }}
      className="rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm text-ink/70 outline-none focus:border-navy"
    >
      <option value="">Jump to a project…</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
      <option value={NEW_PROJECT}>+ New project…</option>
    </select>
  );
}
