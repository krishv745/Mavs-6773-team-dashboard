"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { EventCategoryRow } from "@/lib/supabase/types";

export default function EventCategoryFilter({ categories }: { categories: EventCategoryRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const category = searchParams.get("category") ?? "";

  function update(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("category", value);
    else params.delete("category");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={category}
      onChange={(e) => update(e.target.value)}
      className="rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-navy"
    >
      <option value="">All categories</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
