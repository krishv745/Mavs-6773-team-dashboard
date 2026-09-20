"use client";

import { useRouter } from "next/navigation";
import type { UserRow } from "@/lib/supabase/types";

export default function IndividualLogPicker({
  users,
  selectedId,
}: {
  users: Pick<UserRow, "id" | "name">[];
  selectedId: string;
}) {
  const router = useRouter();

  return (
    <select
      value={selectedId}
      onChange={(e) => router.push(`/team/log?view=individual&person=${e.target.value}`)}
      className="mt-4 w-full max-w-xs rounded-md border border-hairline-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
    >
      <option value="" disabled>
        Select a member
      </option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}
