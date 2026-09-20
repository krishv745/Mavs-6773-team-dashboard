"use client";

import { useRouter } from "next/navigation";

/** Top-of-dashboard picker to jump straight to a project's own page. */
export default function ProjectJumpPicker({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter();

  if (projects.length === 0) return null;

  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) router.push(`/team/projects?project=${e.target.value}`);
      }}
      className="rounded-md border border-hairline-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink/70 outline-none focus:border-navy"
    >
      <option value="">Go to a project…</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
