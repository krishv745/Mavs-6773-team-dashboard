import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import SubsystemPicker from "@/components/team/SubsystemPicker";
import AddCotsFromInventoryModal from "@/components/team/AddCotsFromInventoryModal";
import PutBackSurplusButton from "@/components/team/PutBackSurplusButton";
import PutBackOrphanButton from "@/components/team/PutBackOrphanButton";
import BuildBoardBox, { BoardEmpty } from "@/components/team/BuildBoardBox";
import DeleteBuildEntityButton from "@/components/team/DeleteBuildEntityButton";
import RenameBuildEntityButton from "@/components/team/RenameBuildEntityButton";
import { getProjectPartHolds } from "@/lib/build/holds";
import { getOtherProjectAllocationsByPart, reconcileOrderLineStock, type OtherProjectAllocation } from "@/lib/bom/actions";
import CollectFromOtherProjectButton from "@/components/team/CollectFromOtherProjectButton";
import type { BomLineRow } from "@/lib/supabase/types";

export default async function BuildProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [profile, supabase] = await Promise.all([getCurrentProfile(), createServerClient()]);
  const canManageParts = hasPermission(profile, "manage_parts");

  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!project) notFound();

  const [{ data: subsystems }, { data: allParts }] = await Promise.all([
    supabase.from("subsystems").select("*").eq("project_id", projectId).order("name", { ascending: true }),
    supabase.from("parts").select("id, name, part_number, location, qty_in_stock").order("name", { ascending: true }),
  ]);
  const subsystemList = subsystems ?? [];
  const subsystemName = new Map(subsystemList.map((s) => [s.id, s.name]));

  let lines: BomLineRow[] = [];
  const fileCountBySubsystem = new Map<string, number>();

  if (subsystemList.length > 0) {
    const { data: fetchedLines } = await supabase
      .from("bom_lines")
      .select("*")
      .in("subsystem_id", subsystemList.map((s) => s.id))
      .order("name", { ascending: true });
    lines = fetchedLines ?? [];

    const printLineIds = lines.filter((l) => l.category === "3d_print").map((l) => l.id);
    if (printLineIds.length > 0) {
      const { data: files } = await supabase
        .from("bom_line_files")
        .select("bom_line_id")
        .in("bom_line_id", printLineIds);
      const subsystemByLine = new Map(lines.map((l) => [l.id, l.subsystem_id]));
      for (const f of files ?? []) {
        const sid = subsystemByLine.get(f.bom_line_id);
        if (sid) fileCountBySubsystem.set(sid, (fileCountBySubsystem.get(sid) ?? 0) + 1);
      }
    }
  }

  // Fix up any line whose stored collect/order split has drifted from its
  // matched part's current stock (e.g. another line or project collected it
  // away since) before bucketing anything into "in stock" vs "for purchase".
  const rawOrderLines = lines.filter((l) => l.category === "order");
  const orderPartIds = [
    ...new Set(rawOrderLines.map((l) => l.matched_part_id).filter((id): id is string => Boolean(id))),
  ];
  const { data: orderPartStock } =
    orderPartIds.length > 0
      ? await supabase.from("parts").select("id, qty_in_stock").in("id", orderPartIds)
      : { data: [] };
  const stockByPartId = new Map((orderPartStock ?? []).map((p) => [p.id, p.qty_in_stock]));
  const reconciledOrderLines = await reconcileOrderLineStock(rawOrderLines, stockByPartId);
  const reconciledById = new Map(reconciledOrderLines.map((l) => [l.id, l]));
  lines = lines.map((l) => reconciledById.get(l.id) ?? l);

  const orderLines = lines.filter((l) => l.category === "order");
  const collectedLines = orderLines.filter((l) => l.qty_scanned > 0);
  const purchaseLines = orderLines.filter((l) => l.qty_order - l.qty_fulfilled > 0);
  const cutLines = lines.filter((l) => l.category === "custom_cut");
  const printSubsystems = subsystemList.filter((s) => lines.some((l) => l.category === "3d_print" && l.subsystem_id === s.id));

  // Image + storage location for every Order-line's matched catalog part, so
  // the in-stock/purchase tables can show the same picture and pickup spot
  // the subsystem board already shows.
  const matchedOrderPartIds = [
    ...new Set([...collectedLines, ...purchaseLines].map((l) => l.matched_part_id).filter((id): id is string => Boolean(id))),
  ];
  const { data: matchedOrderParts } =
    matchedOrderPartIds.length > 0
      ? await supabase.from("parts").select("id, image_url, location").in("id", matchedOrderPartIds)
      : { data: [] };
  const matchedPartById = new Map((matchedOrderParts ?? []).map((p) => [p.id, p]));

  // For "COTS Parts (for purchase)" rows — how many units of the same part
  // are already sitting on other projects, so they can be collected from
  // there instead of bought new.
  const purchasePartIds = [
    ...new Set(purchaseLines.map((l) => l.matched_part_id).filter((id): id is string => Boolean(id))),
  ];
  const otherProjectAllocationsByPart: Map<string, OtherProjectAllocation[]> = canManageParts
    ? await getOtherProjectAllocationsByPart(purchasePartIds, projectId)
    : new Map();

  // Allocations still held by this project that no BOM line accounts for —
  // usually left behind by an older disassembly return or a pre-prompt delete.
  const { data: allocs } = await supabase
    .from("part_allocations")
    .select("part_id, qty")
    .eq("project_id", projectId)
    .gt("qty", 0);
  const scannedByPart = new Map<string, number>();
  for (const l of orderLines) {
    if (l.matched_part_id && l.qty_scanned > 0) {
      scannedByPart.set(l.matched_part_id, (scannedByPart.get(l.matched_part_id) ?? 0) + l.qty_scanned);
    }
  }
  const orphanRaw = (allocs ?? [])
    .map((a) => ({ partId: a.part_id, qty: a.qty - (scannedByPart.get(a.part_id) ?? 0) }))
    .filter((o) => o.qty > 0);
  const orphanNameById = new Map<string, string>();
  if (orphanRaw.length > 0) {
    const { data: orphanParts } = await supabase
      .from("parts")
      .select("id, name")
      .in("id", orphanRaw.map((o) => o.partId));
    for (const p of orphanParts ?? []) orphanNameById.set(p.id, p.name);
  }
  const orphans = orphanRaw.map((o) => ({ ...o, name: orphanNameById.get(o.partId) ?? "Unknown part" }));

  // Everything still checked out to this project — deleting it is only offered
  // once this is empty, so no allocation is cascaded away unaccounted for.
  const partHolds = canManageParts ? await getProjectPartHolds(supabase, projectId) : [];

  return (
    <div>
      <Link href="/team/build" className="text-sm font-medium text-ink/50 hover:text-ink">
        ← Back to Build
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <h1 className="font-display text-2xl font-bold text-ink">{project.name}</h1>
          {canManageParts && <RenameBuildEntityButton kind="project" projectId={projectId} currentName={project.name} />}
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2">
          <SubsystemPicker projectId={projectId} subsystems={subsystemList} canManageParts={canManageParts} />
          {canManageParts && subsystemList.length > 0 && (
            <AddCotsFromInventoryModal
              parts={allParts ?? []}
              projectId={projectId}
              subsystems={subsystemList.map((s) => ({ id: s.id, name: s.name }))}
            />
          )}
          {canManageParts && (
            <Link
              href={`/team/build/disassemble/${project.id}`}
              className="rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm font-semibold text-ink/70 transition hover:bg-tint"
            >
              Disassemble this project
            </Link>
          )}
          {canManageParts && (
            <DeleteBuildEntityButton kind="project" projectId={projectId} name={project.name} holds={partHolds} />
          )}
        </div>
      </div>

      {subsystemList.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-hairline-strong bg-surface p-8 text-center">
          <p className="text-sm text-ink/60">
            No subsystems yet.{" "}
            {canManageParts
              ? "Use the Subsystem menu above to create one, then import its Bill of Materials."
              : "Ask a staff member to set up subsystems."}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <BuildBoardBox title="COTS Parts (in stock)" count={collectedLines.length}>
            {orphans.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {orphans.map((o) => (
                  <div
                    key={o.partId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-crimson/30 bg-crimson/5 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{o.name}</p>
                      <p className="text-xs text-crimson">
                        {o.qty} allocated to this project but not on any BOM line
                      </p>
                    </div>
                    {canManageParts && (
                      <PutBackOrphanButton projectId={projectId} partId={o.partId} qty={o.qty} />
                    )}
                  </div>
                ))}
              </div>
            )}
            {collectedLines.length === 0 ? (
              orphans.length === 0 && <BoardEmpty>Nothing collected yet.</BoardEmpty>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-ink/40">
                  <tr>
                    <th className="w-9 pb-2" />
                    <th className="pb-2 font-semibold">Name</th>
                    <th className="pb-2 font-semibold">Part #</th>
                    <th className="pb-2 font-semibold">Location</th>
                    <th className="pb-2 font-semibold">Qty</th>
                    <th className="pb-2 font-semibold">Subsystem</th>
                  </tr>
                </thead>
                <tbody>
                  {collectedLines.map((line) => {
                    const isMarker = line.qty_needed === 0;
                    const part = line.matched_part_id ? matchedPartById.get(line.matched_part_id) : undefined;
                    return (
                      <tr key={line.id} className="border-t border-hairline">
                        <td className="py-1.5 pr-2">
                          {part?.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element -- arbitrary external vendor image, no next/image domain config
                            <img src={part.image_url} alt="" className="h-8 w-8 flex-none rounded object-cover" />
                          )}
                        </td>
                        <td className="py-1.5 pr-2">
                          {line.name}
                          {isMarker && (
                            <span className="ml-2 rounded-full bg-crimson/10 px-2 py-0.5 text-xs font-semibold text-crimson">
                              not in BOM
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-ink/50">{line.part_number ?? "—"}</td>
                        <td className="py-1.5 pr-2 text-ink/60">📍 {part?.location ?? "—"}</td>
                        <td className="py-1.5 pr-2 font-semibold">{line.qty_scanned}</td>
                        <td className="py-1.5 pr-2 text-ink/60">
                          {isMarker && canManageParts ? (
                            <PutBackSurplusButton lineId={line.id} qty={line.qty_scanned} />
                          ) : (
                            (line.subsystem_id && subsystemName.get(line.subsystem_id)) || "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </BuildBoardBox>

          <BuildBoardBox title="COTS Parts (for purchase)" count={purchaseLines.length}>
            {purchaseLines.length === 0 ? (
              <BoardEmpty>Nothing to buy.</BoardEmpty>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-ink/40">
                  <tr>
                    <th className="w-9 pb-2" />
                    <th className="pb-2 font-semibold">Name</th>
                    <th className="pb-2 font-semibold">Part #</th>
                    <th className="pb-2 font-semibold">Qty</th>
                    <th className="pb-2 font-semibold">Subsystem</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseLines.map((line) => {
                    const part = line.matched_part_id ? matchedPartById.get(line.matched_part_id) : undefined;
                    const need = line.qty_order - line.qty_fulfilled;
                    const otherAllocs = line.matched_part_id
                      ? (otherProjectAllocationsByPart.get(line.matched_part_id) ?? [])
                          .map((a) => ({ ...a, qty: Math.min(a.qty, need) }))
                          .filter((a) => a.qty > 0)
                      : [];
                    return (
                      <tr key={line.id} className="border-t border-hairline">
                        <td className="py-1.5 pr-2">
                          {part?.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element -- arbitrary external vendor image, no next/image domain config
                            <img src={part.image_url} alt="" className="h-8 w-8 flex-none rounded object-cover" />
                          )}
                        </td>
                        <td className="py-1.5 pr-2">{line.name}</td>
                        <td className="py-1.5 pr-2 text-ink/50">{line.part_number ?? "—"}</td>
                        <td className="py-1.5 pr-2">
                          <span className="font-semibold">{need}</span>
                          {otherAllocs.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {otherAllocs.map((a) => (
                                <CollectFromOtherProjectButton
                                  key={a.projectId}
                                  lineId={line.id}
                                  fromProjectId={a.projectId}
                                  fromProjectName={a.projectName}
                                  qty={a.qty}
                                />
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-ink/60">
                          {(line.subsystem_id && subsystemName.get(line.subsystem_id)) || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </BuildBoardBox>

          <BuildBoardBox title="3D Printed" count={printSubsystems.length}>
            <div className="mb-3 rounded-md bg-tint/50 px-3 py-2 text-xs text-ink/60">
              <p>Allowed file types: .stl, .3mf, .step, .zip</p>
              <p className="mt-0.5 font-medium text-ink/70">
                All file names should have the following format: PARTNAME_COLOR_QTY_MATERIAL(IF NOT PETG)
              </p>
            </div>
            {printSubsystems.length === 0 ? (
              <BoardEmpty>No 3D-printed parts.</BoardEmpty>
            ) : (
              <ul className="space-y-1.5">
                {printSubsystems.map((s) => {
                  const count = lines.filter((l) => l.category === "3d_print" && l.subsystem_id === s.id).length;
                  const fileCount = fileCountBySubsystem.get(s.id) ?? 0;
                  return (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2 text-sm"
                    >
                      <span>
                        {s.name}
                        <span className="text-ink/40">
                          {" "}
                          · {count} part{count === 1 ? "" : "s"} · {fileCount} file{fileCount === 1 ? "" : "s"}
                        </span>
                      </span>
                      {fileCount > 0 ? (
                        <a
                          href={`/team/build/subsystem/${s.id}/fabrication-zip`}
                          className="rounded-md bg-navy px-2.5 py-1 text-xs font-semibold text-white hover:bg-navy/90"
                        >
                          Download ZIP
                        </a>
                      ) : (
                        <span className="text-xs text-ink/40">no files</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </BuildBoardBox>

          <BuildBoardBox title="Custom Cut (Laser / CNC)" count={cutLines.length}>
            <div className="mb-3 rounded-md bg-tint/50 px-3 py-2 text-xs text-ink/60">
              <p>Allowed file types: .dxf, .step</p>
              <p className="mt-0.5 font-medium text-ink/70">
                All file names should have the following format: PARTNAME_QTY_MATERIAL
              </p>
            </div>
            {cutLines.length === 0 ? (
              <BoardEmpty>No custom-cut parts.</BoardEmpty>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-ink/40">
                  <tr>
                    <th className="pb-2 font-semibold">Name</th>
                    <th className="pb-2 font-semibold">Material</th>
                    <th className="pb-2 font-semibold">Qty</th>
                    <th className="pb-2 font-semibold">Subsystem</th>
                  </tr>
                </thead>
                <tbody>
                  {cutLines.map((line) => (
                    <tr key={line.id} className="border-t border-hairline">
                      <td className="py-1.5 pr-2">
                        {line.name}
                        {line.collected && <span className="ml-1.5 text-xs font-semibold text-navy">✓</span>}
                      </td>
                      <td className="py-1.5 pr-2 text-ink/50">{line.material ?? "—"}</td>
                      <td className="py-1.5 pr-2 font-semibold">{line.qty_needed}</td>
                      <td className="py-1.5 pr-2 text-ink/60">
                        {(line.subsystem_id && subsystemName.get(line.subsystem_id)) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </BuildBoardBox>
        </div>
      )}
    </div>
  );
}
