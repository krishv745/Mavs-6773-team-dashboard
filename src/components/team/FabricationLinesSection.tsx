"use client";

import { useMemo, useState } from "react";
import BomLineCategorySelect from "@/components/team/BomLineCategorySelect";
import DeleteBomLineButton from "@/components/team/DeleteBomLineButton";
import BomLineFileUpload from "@/components/team/BomLineFileUpload";
import BomLineTextField from "@/components/team/BomLineTextField";
import CollectedCheckbox from "@/components/team/CollectedCheckbox";
import type { BomLineFileRow, BomLineRow } from "@/lib/supabase/types";

const COLLECTED_LABEL: Record<"3d_print" | "custom_cut", string> = { "3d_print": "Printed", custom_cut: "Collected" };
type SortKey = "name" | "material" | "color";

export default function FabricationLinesSection({
  category,
  lines,
  filesByLine,
  canManageParts,
}: {
  category: "3d_print" | "custom_cut";
  lines: BomLineRow[];
  filesByLine: Map<string, BomLineFileRow[]>;
  canManageParts: boolean;
}) {
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [materialFilter, setMaterialFilter] = useState("");
  const [colorFilter, setColorFilter] = useState("");

  const materials = useMemo(
    () => [...new Set(lines.map((l) => l.material).filter((m): m is string => Boolean(m)))].sort(),
    [lines],
  );
  const colors = useMemo(
    () => [...new Set(lines.map((l) => l.color).filter((c): c is string => Boolean(c)))].sort(),
    [lines],
  );

  const visibleLines = useMemo(() => {
    let v = lines;
    if (materialFilter) v = v.filter((l) => l.material === materialFilter);
    if (colorFilter) v = v.filter((l) => l.color === colorFilter);
    return [...v].sort((a, b) => (a[sortBy] ?? "").localeCompare(b[sortBy] ?? ""));
  }, [lines, materialFilter, colorFilter, sortBy]);

  return (
    <div>
      {(materials.length > 0 || colors.length > 0) && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1 text-ink/50">
            Sort by
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded border border-hairline-strong px-1.5 py-1 text-xs outline-none focus:border-navy"
            >
              <option value="name">Name</option>
              <option value="material">Material</option>
              <option value="color">Color</option>
            </select>
          </label>
          {materials.length > 0 && (
            <select
              value={materialFilter}
              onChange={(e) => setMaterialFilter(e.target.value)}
              className="rounded border border-hairline-strong px-1.5 py-1 text-xs outline-none focus:border-navy"
            >
              <option value="">All materials</option>
              {materials.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
          {colors.length > 0 && (
            <select
              value={colorFilter}
              onChange={(e) => setColorFilter(e.target.value)}
              className="rounded border border-hairline-strong px-1.5 py-1 text-xs outline-none focus:border-navy"
            >
              <option value="">All colors</option>
              {colors.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        {visibleLines.map((line) => {
          const files = filesByLine.get(line.id) ?? [];
          return (
            <div key={line.id} className="rounded-lg border border-hairline bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{line.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink/50">
                    <span>Need {line.qty_needed}</span>
                    <BomLineTextField
                      lineId={line.id}
                      field="material"
                      value={line.material}
                      label="Material"
                      canManageParts={canManageParts}
                    />
                    <BomLineTextField
                      lineId={line.id}
                      field="color"
                      value={line.color}
                      label="Color"
                      canManageParts={canManageParts}
                    />
                  </p>
                </div>
                <div className="flex flex-none items-center gap-2">
                  {canManageParts ? (
                    <CollectedCheckbox lineId={line.id} collected={line.collected} label={COLLECTED_LABEL[category]} />
                  ) : (
                    line.collected && (
                      <span className="text-xs font-semibold text-navy">✓ {COLLECTED_LABEL[category]}</span>
                    )
                  )}
                  {canManageParts && <BomLineCategorySelect lineId={line.id} category={line.category} />}
                  {canManageParts && <DeleteBomLineButton lineId={line.id} />}
                </div>
              </div>
              <BomLineFileUpload
                lineId={line.id}
                category={line.category}
                files={files.map((f) => ({ id: f.id, url: f.url, filename: f.filename }))}
                canManageParts={canManageParts}
              />
            </div>
          );
        })}
        {visibleLines.length === 0 && <p className="text-sm text-ink/40">No lines match that filter.</p>}
      </div>
    </div>
  );
}
