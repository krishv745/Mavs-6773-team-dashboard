"use client";

import { useMemo, useState } from "react";
import EditPartModal from "@/components/team/EditPartModal";
import RemovePartButton from "@/components/team/RemovePartButton";
import type { PartRow } from "@/lib/supabase/types";

const NO_LOCATION = "__none__";

function csvEscape(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function exportPartsCsv(rows: PartRow[], allocByPart: Record<string, { project: string; qty: number }[]>) {
  const header = ["Name", "Part Number", "Qty In Stock", "Cost Per Unit", "Location", "Link", "Allocated To"];
  const lines = [header.join(",")];
  for (const p of rows) {
    const allocations = (allocByPart[p.id] ?? []).map((a) => `${a.project}:${a.qty}`).join("; ");
    lines.push(
      [
        p.name,
        p.part_number ?? "",
        String(p.qty_in_stock),
        p.unit_cost != null ? p.unit_cost.toFixed(2) : "",
        p.location ?? "",
        p.link ?? "",
        allocations,
      ]
        .map((v) => csvEscape(v))
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `parts-export-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function PartsTable({
  parts,
  allocByPart,
  locations,
  emptyMessage,
  canManageParts,
}: {
  parts: PartRow[];
  allocByPart: Record<string, { project: string; qty: number }[]>;
  locations: string[];
  emptyMessage: string;
  canManageParts: boolean;
}) {
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  const filteredParts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parts.filter((p) => {
      if (locationFilter === NO_LOCATION && p.location) return false;
      if (locationFilter && locationFilter !== NO_LOCATION && p.location !== locationFilter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.part_number ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [parts, search, locationFilter]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search parts by name or part number…"
          className="min-w-[200px] flex-1 rounded-md border border-hairline-strong px-3 py-1.5 text-sm outline-none focus:border-navy"
        />
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="rounded-md border border-hairline-strong bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-navy"
        >
          <option value="">All locations</option>
          <option value={NO_LOCATION}>No location set</option>
          {locations.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => exportPartsCsv(filteredParts, allocByPart)}
          className="rounded-md border border-hairline-strong px-3 py-1.5 text-sm font-medium text-ink/70 transition hover:bg-tint"
        >
          Export CSV
        </button>
      </div>

      {(search || locationFilter) && (
        <p className="mb-2 text-xs text-ink/40">
          Showing {filteredParts.length} of {parts.length} parts · $
          {filteredParts
            .reduce((sum, p) => sum + (p.unit_cost ?? 0), 0)
            .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
          total cost
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-hairline bg-tint/60 text-xs uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-4 py-3 font-semibold">Part</th>
              <th className="px-4 py-3 font-semibold">Qty in stock</th>
              <th className="px-4 py-3 font-semibold">Cost</th>
              <th className="px-4 py-3 font-semibold">Location</th>
              <th className="px-4 py-3 font-semibold">Allocated to</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredParts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink/40">
                  {parts.length === 0 ? emptyMessage : "No parts match your search or filter."}
                </td>
              </tr>
            )}
            {filteredParts.map((part) => (
              <tr key={part.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    {part.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element -- arbitrary external vendor image, no next/image domain config
                      <img
                        src={part.image_url}
                        alt=""
                        className="h-9 w-9 flex-none rounded object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{part.name}</p>
                      <p className="text-xs text-ink/40">
                        {part.part_number && `#${part.part_number} · `}
                        {part.link ? (
                          <a
                            href={part.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-navy hover:underline"
                          >
                            view link
                          </a>
                        ) : (
                          "no link"
                        )}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold text-ink">{part.qty_in_stock}</td>
                <td className="px-4 py-3 text-ink/60">
                  {part.unit_cost != null ? `$${part.unit_cost.toFixed(2)}` : "—"}
                </td>
                <td className="px-4 py-3 text-ink/60">{part.location ?? "—"}</td>
                <td className="px-4 py-3">
                  {(allocByPart[part.id] ?? []).length === 0 ? (
                    <span className="text-ink/30">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {allocByPart[part.id].map((a) => (
                        <span
                          key={a.project}
                          className="rounded-full bg-navy/10 px-2 py-0.5 text-xs font-medium text-navy"
                        >
                          {a.project}: {a.qty}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <EditPartModal part={part} locations={locations} />
                    {canManageParts && <RemovePartButton partId={part.id} name={part.name} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
