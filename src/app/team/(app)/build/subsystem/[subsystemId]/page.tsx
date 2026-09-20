import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import ImportBomModal from "@/components/team/ImportBomModal";
import AddCotsFromInventoryModal from "@/components/team/AddCotsFromInventoryModal";
import SubsystemBuildBoard from "@/components/team/SubsystemBuildBoard";
import DeleteBuildEntityButton from "@/components/team/DeleteBuildEntityButton";
import RenameBuildEntityButton from "@/components/team/RenameBuildEntityButton";
import { getSubsystemPartHolds } from "@/lib/build/holds";
import { getOtherProjectAllocationsByPart, reconcileOrderLineStock, type OtherProjectAllocation } from "@/lib/bom/actions";
import type { BomLineFileRow, BomLineRow } from "@/lib/supabase/types";

export default async function SubsystemPage({ params }: { params: Promise<{ subsystemId: string }> }) {
  const { subsystemId } = await params;
  const [profile, supabase] = await Promise.all([getCurrentProfile(), createServerClient()]);
  const canManageParts = hasPermission(profile, "manage_parts");

  const { data: subsystem } = await supabase.from("subsystems").select("*").eq("id", subsystemId).maybeSingle();
  if (!subsystem) notFound();

  const [{ data: project }, { data: imports }, { data: fetchedLines }, { data: allParts }] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", subsystem.project_id).maybeSingle(),
    supabase.from("bom_imports").select("id, source").eq("subsystem_id", subsystemId),
    supabase.from("bom_lines").select("*").eq("subsystem_id", subsystemId).order("name", { ascending: true }),
    supabase.from("parts").select("id, name, part_number, location, qty_in_stock").order("name", { ascending: true }),
  ]);
  if (!project) notFound();

  const lines: BomLineRow[] = fetchedLines ?? [];
  const hasExistingBom = (imports ?? []).some((i) => i.source !== "manual");

  const matchedPartIds = [
    ...new Set(lines.filter((l) => l.category === "order" && l.matched_part_id).map((l) => l.matched_part_id!)),
  ];
  const [{ data: matchedPartRows }, { data: files }] = await Promise.all([
    matchedPartIds.length > 0
      ? supabase
          .from("parts")
          .select("id, name, part_number, qty_in_stock, link, location, image_url")
          .in("id", matchedPartIds)
      : Promise.resolve({ data: [] }),
    lines.length > 0
      ? supabase.from("bom_line_files").select("*").in("bom_line_id", lines.map((l) => l.id))
      : Promise.resolve({ data: [] }),
  ]);

  // COTS units collected against this subsystem — deleting it is only offered
  // once they're all back in inventory, so no BOM line is cascaded away while
  // it still accounts for real stock.
  const partHolds = canManageParts ? await getSubsystemPartHolds(supabase, subsystemId) : [];

  const matchedParts = new Map((matchedPartRows ?? []).map((p) => [p.id, p]));

  // Fix up any line whose stored collect/order split has drifted from the
  // matched part's current stock (e.g. another line or project collected it
  // away since) before bucketing anything into "in stock" vs "for purchase".
  const stockByPartId = new Map((matchedPartRows ?? []).map((p) => [p.id, p.qty_in_stock]));
  const reconciledLines = await reconcileOrderLineStock(lines, stockByPartId);

  const filesByLine = new Map<string, BomLineFileRow[]>();
  for (const f of files ?? []) {
    const list = filesByLine.get(f.bom_line_id) ?? [];
    list.push(f);
    filesByLine.set(f.bom_line_id, list);
  }

  // For "COTS Parts (for purchase)" lines — how many units of the same part
  // are already sitting on other projects, so they can be collected from
  // there instead of bought new.
  const otherProjectAllocationsByPart: Map<string, OtherProjectAllocation[]> = canManageParts
    ? await getOtherProjectAllocationsByPart(matchedPartIds, subsystem.project_id)
    : new Map();

  return (
    <div>
      <Link
        href={`/team/build/project/${project.id}`}
        className="text-sm font-medium text-ink/50 hover:text-ink"
      >
        ← Back to {project.name}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="font-display text-2xl font-bold text-ink">{subsystem.name}</h1>
            {canManageParts && (
              <RenameBuildEntityButton kind="subsystem" subsystemId={subsystemId} currentName={subsystem.name} />
            )}
          </div>
          <p className="mt-1 text-sm text-ink/60">Subsystem of {project.name}</p>
        </div>
        {canManageParts && (
          <div className="flex flex-none flex-wrap items-center gap-2">
            <AddCotsFromInventoryModal parts={allParts ?? []} subsystemId={subsystemId} />
            <ImportBomModal subsystemId={subsystemId} hasExistingBom={hasExistingBom} />
            <DeleteBuildEntityButton
              kind="subsystem"
              subsystemId={subsystemId}
              projectId={project.id}
              name={subsystem.name}
              holds={partHolds}
            />
          </div>
        )}
      </div>

      {lines.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-hairline-strong bg-surface px-4 py-3 text-sm text-ink/50">
          {canManageParts
            ? "Import a Bill of Materials or add a COTS part from inventory to fill these in."
            : "No parts yet — ask a staff member to import a Bill of Materials."}
        </p>
      )}

      <div className="mt-6">
        <SubsystemBuildBoard
          subsystemId={subsystemId}
          lines={reconciledLines}
          matchedParts={matchedParts}
          filesByLine={filesByLine}
          allParts={allParts ?? []}
          otherProjectAllocationsByPart={otherProjectAllocationsByPart}
          canManageParts={canManageParts}
        />
      </div>
    </div>
  );
}
