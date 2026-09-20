import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { formatClockDateTime } from "@/lib/formatTime";
import BomChecklist from "@/components/team/BomChecklist";
import type { BomLineFileRow, BomLineRow } from "@/lib/supabase/types";

/** Read/act on a single past BOM import — the live/latest one for a project is shown on its dashboard at /team/build/project/[projectId] instead. */
export default async function BomImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [profile, supabase] = await Promise.all([getCurrentProfile(), createServerClient()]);
  const canManageParts = hasPermission(profile, "manage_parts");

  const { data: bomImport } = await supabase.from("bom_imports").select("*").eq("id", id).maybeSingle();
  if (!bomImport) notFound();

  const [{ data: project }, { data: lines }, { data: subsystem }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", bomImport.project_id).maybeSingle(),
    supabase.from("bom_lines").select("*").eq("bom_import_id", id).order("name", { ascending: true }),
    bomImport.subsystem_id
      ? supabase.from("subsystems").select("id, name").eq("id", bomImport.subsystem_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!project) notFound();

  const backHref = subsystem ? `/team/build/subsystem/${subsystem.id}` : `/team/build/project/${project.id}`;
  const backLabel = subsystem ? subsystem.name : project.name;

  const allLines: BomLineRow[] = lines ?? [];
  // Only COTS (order) lines ever match a real parts-catalog row — 3D
  // Print/Custom Cut lines are checklist-only and never touch `parts`.
  const matchedPartIds = [
    ...new Set(allLines.filter((l) => l.category === "order" && l.matched_part_id).map((l) => l.matched_part_id!)),
  ];
  const [{ data: matchedParts }, { data: allocRows }, { data: allParts }, { data: files }] = await Promise.all([
    matchedPartIds.length > 0
      ? supabase.from("parts").select("id, name, part_number, qty_in_stock, link").in("id", matchedPartIds)
      : Promise.resolve({ data: [] }),
    matchedPartIds.length > 0
      ? supabase.from("part_allocations").select("part_id, qty").eq("project_id", project.id).in("part_id", matchedPartIds)
      : Promise.resolve({ data: [] }),
    supabase.from("parts").select("id, name, part_number").order("name", { ascending: true }),
    supabase.from("bom_line_files").select("*").in("bom_line_id", allLines.map((l) => l.id)),
  ]);
  const partById = new Map((matchedParts ?? []).map((p) => [p.id, p]));
  const allocQtyByPart = new Map((allocRows ?? []).map((a) => [a.part_id, a.qty]));
  const filesByLine = new Map<string, BomLineFileRow[]>();
  for (const f of files ?? []) {
    const list = filesByLine.get(f.bom_line_id) ?? [];
    list.push(f);
    filesByLine.set(f.bom_line_id, list);
  }

  return (
    <div>
      <Link href={backHref} className="text-sm font-medium text-ink/50 hover:text-ink">
        ← Back to {backLabel}
      </Link>
      <div className="mt-3">
        <h1 className="font-display text-2xl font-bold text-ink">BOM import — {project.name}</h1>
        <p className="mt-1 text-sm text-ink/60">
          Imported {formatClockDateTime(bomImport.imported_at)} · {allLines.length} line
          {allLines.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="mt-6">
        <BomChecklist
          project={project}
          lines={allLines}
          matchedParts={partById}
          allocQtyByPart={allocQtyByPart}
          allParts={allParts ?? []}
          filesByLine={filesByLine}
          canManageParts={canManageParts}
        />
      </div>
    </div>
  );
}
