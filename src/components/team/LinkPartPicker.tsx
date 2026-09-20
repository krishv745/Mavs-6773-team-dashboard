"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { linkBomLineToPartAction } from "@/lib/bom/actions";
import QuickAddPart from "@/components/team/QuickAddPart";

export default function LinkPartPicker({
  lineId,
  parts,
}: {
  lineId: string;
  parts: { id: string; name: string; part_number: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  // Mirrors `adding` synchronously — the input's onBlur runs in a setTimeout
  // whose closure would otherwise see whatever `adding` was when the input
  // was last rendered (stale by the time the timeout fires), and wrongly
  // close the popover out from under the just-opened "＋ Add part" form.
  const addingRef = useRef(false);
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parts.slice(0, 8);
    return parts
      .filter((p) => p.name.toLowerCase().includes(q) || (p.part_number ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [parts, query]);

  function close() {
    setOpen(false);
    setAdding(false);
    addingRef.current = false;
    setQuery("");
  }

  function select(partId: string) {
    startTransition(async () => {
      await linkBomLineToPartAction(lineId, partId);
    });
    close();
  }

  function startAdding() {
    addingRef.current = true;
    setAdding(true);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-crimson/30 bg-crimson/5 px-2 py-1 text-xs font-medium text-crimson hover:border-crimson"
      >
        No match — search for a part
      </button>
    );
  }

  if (adding) {
    return (
      <div className="relative">
        <div className="absolute right-0 z-10 mt-1 w-72 rounded-md border border-hairline-strong bg-surface text-left shadow-lg">
          <QuickAddPart onCreated={(part) => select(part.id)} onCancel={() => setAdding(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        autoFocus
        value={query}
        disabled={isPending}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => !addingRef.current && setOpen(false), 150)}
        placeholder="Search by name or part number…"
        className="w-48 rounded-md border border-crimson/30 bg-surface px-2 py-1 text-xs outline-none focus:border-crimson disabled:opacity-50"
      />
      <div className="absolute right-0 z-10 mt-1 max-h-64 w-64 overflow-y-auto rounded-md border border-hairline-strong bg-surface text-left shadow-lg">
        <button
          type="button"
          // onMouseDown (not onClick) fires before the input's onBlur closes the dropdown.
          onMouseDown={startAdding}
          className="block w-full border-b border-hairline px-3 py-2 text-left text-xs font-semibold text-navy hover:bg-tint"
        >
          ＋ Add part
        </button>
        {results.length === 0 ? (
          <p className="px-3 py-2 text-xs text-ink/40">No parts match.</p>
        ) : (
          results.map((p) => (
            <button
              key={p.id}
              type="button"
              // onMouseDown (not onClick) fires before the input's onBlur closes the dropdown.
              onMouseDown={() => select(p.id)}
              className="block w-full truncate px-3 py-2 text-left text-xs text-ink hover:bg-tint"
            >
              {p.name}
              {p.part_number && <span className="text-ink/40"> · #{p.part_number}</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
