"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function ViewToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "list" ? "list" : "calendar";

  function update(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex rounded-md border border-hairline-strong bg-surface p-0.5">
      <button
        type="button"
        onClick={() => update("calendar")}
        className={`rounded px-3 py-1.5 text-sm font-medium transition ${
          view === "calendar" ? "bg-navy text-white" : "text-ink/60"
        }`}
      >
        Calendar
      </button>
      <button
        type="button"
        onClick={() => update("list")}
        className={`rounded px-3 py-1.5 text-sm font-medium transition ${
          view === "list" ? "bg-navy text-white" : "text-ink/60"
        }`}
      >
        List
      </button>
    </div>
  );
}
