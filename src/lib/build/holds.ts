import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { PartHold } from "@/lib/build/types";

export type { PartHold };

type Client = SupabaseClient<Database>;

const byName = (a: PartHold, b: PartHold) => a.name.localeCompare(b.name);

/**
 * COTS units still allocated to a Build project. part_allocations is the
 * authoritative "who's holding this" record — a return zeroes the row out —
 * so this covers subsystem-collected units and orphaned allocations alike.
 *
 * 3D-print/custom-cut parts are excluded even if allocated: they're
 * discarded (not returned to stock) on disassembly, so requiring them back
 * in inventory before a delete would be a requirement that can never be met.
 */
export async function getProjectPartHolds(client: Client, projectId: string): Promise<PartHold[]> {
  const { data: allocs } = await client
    .from("part_allocations")
    .select("part_id, qty")
    .eq("project_id", projectId)
    .gt("qty", 0);
  if (!allocs || allocs.length === 0) return [];

  const { data: parts } = await client
    .from("parts")
    .select("id, name, manufacturing_method")
    .in("id", allocs.map((a) => a.part_id));
  const partById = new Map((parts ?? []).map((p) => [p.id, p]));
  const isFabricated = (m: string | null | undefined) => m === "3d_print" || m === "custom_cut";

  return allocs
    .filter((a) => !isFabricated(partById.get(a.part_id)?.manufacturing_method))
    .map((a) => ({ partId: a.part_id, name: partById.get(a.part_id)?.name ?? "Unknown part", qty: a.qty }))
    .sort(byName);
}

/**
 * Units collected against a subsystem's BOM. Only Order-bucket lines pull real
 * stock — 3D-print/custom-cut lines are checklist-only and never hold
 * inventory, so they don't block a delete.
 */
export async function getSubsystemPartHolds(client: Client, subsystemId: string): Promise<PartHold[]> {
  const { data: lines } = await client
    .from("bom_lines")
    .select("matched_part_id, name, qty_scanned")
    .eq("subsystem_id", subsystemId)
    .eq("category", "order")
    .gt("qty_scanned", 0);

  return (lines ?? [])
    .map((l) => ({ partId: l.matched_part_id, name: l.name, qty: l.qty_scanned }))
    .sort(byName);
}
