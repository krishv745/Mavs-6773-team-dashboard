"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { GENERAL_INVENTORY_ID } from "@/lib/parts/constants";
import { getProjectPartHolds, type PartHold } from "@/lib/build/holds";
import type { ActionState } from "@/lib/auth/actions";

function extractPartNumber(html: string): string | undefined {
  // Best-effort: try Product JSON-LD first (sku/mpn), then fall back to
  // scanning visible text for common "Part #: X" / "SKU: X" patterns.
  // Vendor pages vary too much to guarantee this — it's a starting point,
  // not a real parser.
  const jsonLdBlocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1]);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        const sku = item?.sku ?? item?.mpn ?? item?.productID;
        if (typeof sku === "string" && sku.trim()) return sku.trim().slice(0, 80);
      }
    } catch {
      // not valid JSON — ignore and fall through to regex
    }
  }

  const textMatch = html.match(
    /(?:part\s*(?:#|number|no\.?)|sku|item\s*#|model\s*#?)\s*[:#]?\s*<[^>]*>?\s*([A-Za-z0-9][A-Za-z0-9\-._]{2,24})/i,
  );
  return textMatch?.[1]?.trim();
}

function extractImageUrl(html: string, pageUrl: string): string | undefined {
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  const linkMatch = html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
  const raw = ogMatch?.[1] ?? linkMatch?.[1];
  if (!raw) return undefined;
  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return undefined;
  }
}

function extractPrice(html: string): number | undefined {
  // Prefer JSON-LD Product/Offer price (schema.org standard), then fall back
  // to the og:price / product:price meta tags most storefronts also emit.
  const jsonLdBlocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1]);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        const price = item?.offers?.price ?? item?.offers?.[0]?.price;
        const num = typeof price === "string" ? Number(price) : price;
        if (typeof num === "number" && Number.isFinite(num)) return num;
      }
    } catch {
      // not valid JSON — ignore and fall through
    }
  }

  const metaMatch = html.match(
    /<meta[^>]+property=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([0-9.]+)["']/i,
  );
  if (metaMatch) {
    const num = Number(metaMatch[1]);
    if (Number.isFinite(num)) return num;
  }

  return undefined;
}

export async function fetchLinkMetadataAction(
  url: string,
): Promise<{ name?: string; partNumber?: string; imageUrl?: string; unitCost?: number; error?: string }> {
  if (!url) return { error: "No link provided." };
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Mavericks6773Bot/1.0)" },
      signal: AbortSignal.timeout(6000),
    });
    const html = await res.text();
    const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const raw = ogMatch?.[1] ?? titleMatch?.[1];
    if (!raw) return { error: "Couldn't read that page. Fill in the name manually." };

    return {
      name: raw.trim().slice(0, 200),
      partNumber: extractPartNumber(html),
      imageUrl: extractImageUrl(html, url),
      unitCost: extractPrice(html),
    };
  } catch {
    return { error: "Couldn't reach that link. Fill in the name manually." };
  }
}

/**
 * Staff-only. Fills in image_url for existing parts that have a link but no
 * image — the fetch-on-save path only ever ran for parts created/edited
 * after that feature shipped, so anything added before then (or added
 * without clicking "Fetch info") is otherwise stuck without a thumbnail
 * forever. Safe to re-run any time; only touches parts still missing one.
 */
export async function backfillPartImagesAction(): Promise<{ checked: number; updated: number; error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { checked: 0, updated: 0, error: "Not authorized." };

  const admin = createAdminClient();
  const { data: parts } = await admin
    .from("parts")
    .select("id, link")
    .not("link", "is", null)
    .is("image_url", null);

  let updated = 0;
  for (const part of parts ?? []) {
    if (!part.link) continue;
    try {
      const res = await fetch(part.link, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Mavericks6773Bot/1.0)" },
        signal: AbortSignal.timeout(6000),
      });
      const html = await res.text();
      const imageUrl = extractImageUrl(html, part.link);
      if (imageUrl) {
        await admin.from("parts").update({ image_url: imageUrl }).eq("id", part.id);
        updated++;
      }
    } catch {
      // Unreachable link or timeout — leave it for a manual "Fetch image" instead.
    }
  }

  revalidatePath("/team/build");
  return { checked: (parts ?? []).length, updated };
}

/**
 * Staff-only. Fills in unit_cost for existing parts that have a link but no
 * cost recorded yet — same shape as backfillPartImagesAction. Safe to re-run;
 * only touches parts still missing a cost.
 */
export async function backfillPartCostsAction(): Promise<{ checked: number; updated: number; error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { checked: 0, updated: 0, error: "Not authorized." };

  const admin = createAdminClient();
  const { data: parts } = await admin
    .from("parts")
    .select("id, link")
    .not("link", "is", null)
    .is("unit_cost", null);

  let updated = 0;
  for (const part of parts ?? []) {
    if (!part.link) continue;
    try {
      const res = await fetch(part.link, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Mavericks6773Bot/1.0)" },
        signal: AbortSignal.timeout(6000),
      });
      const html = await res.text();
      const unitCost = extractPrice(html);
      if (unitCost !== undefined) {
        await admin.from("parts").update({ unit_cost: unitCost }).eq("id", part.id);
        updated++;
      }
    } catch {
      // Unreachable link or timeout — leave it for a manual edit instead.
    }
  }

  revalidatePath("/team/build");
  return { checked: (parts ?? []).length, updated };
}

export async function createPartAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const name = String(formData.get("name") ?? "").trim();
  const partNumber = String(formData.get("partNumber") ?? "").trim() || null;
  const link = String(formData.get("link") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  const qty = Number(formData.get("qty") ?? 0) || 0;
  const unitCostRaw = String(formData.get("unitCost") ?? "").trim();
  const unitCost = unitCostRaw ? Number(unitCostRaw) : null;

  if (!name) return { error: "Part name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("parts").insert({
    name,
    part_number: partNumber,
    link,
    location,
    image_url: imageUrl,
    qty_in_stock: qty,
    unit_cost: unitCost,
  });
  if (error) return { error: error.message };

  revalidatePath("/team/build");
  redirect("/team/build");
}

export type QuickAddPartResult = {
  part?: { id: string; name: string; part_number: string | null };
  error?: string;
};

/**
 * Creates a part with no location — the "＋ Add part" flow inline inside
 * LinkPartPicker (linking a BOM line straight to a not-yet-in-inventory
 * part) and AddCotsFromInventoryModal (adding a COTS part to a subsystem
 * from a pasted link), so a brand new part can be received into the general
 * parts database without leaving either flow to go create it separately
 * first. Unlike createPartAction it doesn't redirect — the caller gets the
 * new part back to use immediately — and it never takes a location; that
 * gets filed in later from the main Parts table once someone knows where it
 * physically lives.
 */
export async function createUnassignedPartAction({
  name,
  partNumber,
  link,
  imageUrl,
  qty,
  unitCost,
}: {
  name: string;
  partNumber?: string;
  link?: string;
  imageUrl?: string;
  qty: number;
  unitCost?: number;
}): Promise<QuickAddPartResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const trimmedName = name.trim();
  if (!trimmedName) return { error: "Part name is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("parts")
    .insert({
      name: trimmedName,
      part_number: partNumber?.trim() || null,
      link: link?.trim() || null,
      image_url: imageUrl?.trim() || null,
      location: null,
      qty_in_stock: Math.max(0, Math.round(qty) || 0),
      unit_cost: unitCost !== undefined && Number.isFinite(unitCost) ? unitCost : null,
    })
    .select("id, name, part_number")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not add that part." };

  revalidatePath("/team/build");
  return { part: data };
}

export async function updatePartAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const partId = String(formData.get("partId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const partNumber = String(formData.get("partNumber") ?? "").trim() || null;
  const link = String(formData.get("link") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  const qty = Number(formData.get("qty") ?? 0) || 0;
  const unitCostRaw = String(formData.get("unitCost") ?? "").trim();
  const unitCost = unitCostRaw ? Number(unitCostRaw) : null;

  if (!partId) return { error: "Missing part." };
  if (!name) return { error: "Part name is required." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("parts")
    .update({
      name,
      part_number: partNumber,
      link,
      location,
      image_url: imageUrl,
      qty_in_stock: qty,
      unit_cost: unitCost,
    })
    .eq("id", partId);
  if (error) return { error: error.message };

  revalidatePath("/team/build");
  return undefined;
}

export async function deletePartAction(partId: string) {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) throw new Error("Not authorized to remove a part.");

  const admin = createAdminClient();
  // scan_events references parts without ON DELETE CASCADE (its history should
  // survive most part edits), so it's cleared explicitly before the part itself.
  await admin.from("scan_events").delete().eq("part_id", partId);
  const { error } = await admin.from("parts").delete().eq("id", partId);
  if (error) throw new Error(error.message);

  revalidatePath("/team/build");
}

export async function createProjectAction(
  name: string,
): Promise<{ id?: string; name?: string; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Project name is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("projects")
    .insert({ name: trimmed })
    .select("id, name")
    .single();
  if (error || !data) return { error: "That project may already exist." };

  revalidatePath("/team/build");
  return { id: data.id, name: data.name };
}

/** Staff-only. Renames a Build project. */
export async function renameBuildProjectAction(
  projectId: string,
  name: string,
): Promise<{ name?: string; error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const trimmed = name.trim();
  if (!projectId) return { error: "Missing project." };
  if (!trimmed) return { error: "Project name is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("projects")
    .update({ name: trimmed })
    .eq("id", projectId)
    .select("id, name")
    .maybeSingle();
  if (error) return { error: "A project with that name may already exist." };
  if (!data) return { error: "That project no longer exists." };

  revalidatePath(`/team/build/project/${projectId}`);
  revalidatePath("/team/build");
  return { name: data.name };
}

/**
 * Staff-only. Deletes a Build project and everything under it — subsystems,
 * BOM imports/lines/file rows, allocations and disassembly sessions all
 * cascade.
 *
 * Refuses while any COTS part is still allocated to the project: those units
 * are out of general inventory, and cascading their allocations away would
 * lose them from the count for good. Everything has to be returned first (via
 * Disassemble, or the board's "Put back" buttons). 3D-print/custom-cut parts
 * (discarded, never returned) and parts not yet collected don't count. The
 * outstanding list comes back in `holds` so the caller can name the parts.
 */
export async function deleteBuildProjectAction(
  projectId: string,
  confirmName: string,
): Promise<{ error?: string; holds?: PartHold[] }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };
  if (!projectId) return { error: "Missing project." };

  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("name").eq("id", projectId).maybeSingle();
  if (!project) return { error: "That project no longer exists." };
  if (confirmName.trim() !== project.name) return { error: "Type the project name exactly to confirm." };

  // Re-checked here, not just in the UI — the button is only a shortcut to
  // this action.
  const holds = await getProjectPartHolds(admin, projectId);
  if (holds.length > 0) {
    return { holds, error: "Return this project's collected COTS parts to inventory first." };
  }

  // scan_events points at projects without ON DELETE CASCADE, and its rows are
  // a part's movement history worth keeping — detach them rather than letting
  // the delete fail or taking the history down with it.
  await admin.from("scan_events").update({ project_id: null }).eq("project_id", projectId);

  const { error } = await admin.from("projects").delete().eq("id", projectId);
  if (error) return { error: error.message };

  revalidatePath("/team/build");
  return {};
}

export async function reallocateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const partId = String(formData.get("partId") ?? "");
  const fromProjectId = String(formData.get("fromProjectId") ?? "") || null;
  const toProjectId = String(formData.get("toProjectId") ?? "");
  const qty = Number(formData.get("qty") ?? 0) || 0;

  if (!partId || !toProjectId || qty <= 0) {
    return { error: "Choose a part, destination, and quantity." };
  }
  if (toProjectId === GENERAL_INVENTORY_ID && !fromProjectId) {
    return { error: "Pick a source project to move stock back from." };
  }

  const admin = createAdminClient();

  if (fromProjectId) {
    const { data: fromAlloc } = await admin
      .from("part_allocations")
      .select("qty")
      .eq("part_id", partId)
      .eq("project_id", fromProjectId)
      .maybeSingle();
    const newQty = Math.max(0, (fromAlloc?.qty ?? 0) - qty);
    await admin
      .from("part_allocations")
      .upsert({ part_id: partId, project_id: fromProjectId, qty: newQty }, { onConflict: "part_id,project_id" });
  }

  if (toProjectId === GENERAL_INVENTORY_ID) {
    const { data: part } = await admin.from("parts").select("qty_in_stock").eq("id", partId).maybeSingle();
    await admin.from("parts").update({ qty_in_stock: (part?.qty_in_stock ?? 0) + qty }).eq("id", partId);
  } else {
    const { data: toAlloc } = await admin
      .from("part_allocations")
      .select("qty")
      .eq("part_id", partId)
      .eq("project_id", toProjectId)
      .maybeSingle();
    await admin
      .from("part_allocations")
      .upsert(
        { part_id: partId, project_id: toProjectId, qty: (toAlloc?.qty ?? 0) + qty },
        { onConflict: "part_id,project_id" },
      );
  }

  revalidatePath("/team/build");
  return undefined;
}

export type ManualReturnResult = { error?: string; partName?: string; moved?: number; newQtyInStock?: number };

/**
 * Staff-only. Marks a chosen quantity of a part as returned from a project
 * to general stock without scanning — credits qty_in_stock, debits that
 * project's allocation. Used both by the BOM checklist (put a COTS part back
 * from the same line it was collected on) and disassembly (return parts as
 * a project gets torn down). The caller picks the quantity (the UI defaults
 * it to the full current allocation, but staff can dial it up or down — e.g.
 * a physical recount found more or fewer than the system expected).
 * Allocation is floored at zero rather than capped going in, since
 * over-returning is a legitimate correction, not an error.
 */
export async function manuallyReturnPartAction(
  projectId: string,
  partId: string,
  qty: number,
  opts?: { syncBomLines?: boolean },
): Promise<ManualReturnResult> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const amount = Math.max(0, Math.round(qty));
  if (amount <= 0) return {};

  const admin = createAdminClient();
  const { data: alloc } = await admin
    .from("part_allocations")
    .select("qty")
    .eq("part_id", partId)
    .eq("project_id", projectId)
    .maybeSingle();
  const currentAlloc = alloc?.qty ?? 0;

  const { data: part } = await admin.from("parts").select("name, qty_in_stock").eq("id", partId).maybeSingle();
  if (!part) return { error: "That part no longer exists." };

  const newQtyInStock = part.qty_in_stock + amount;
  const newAllocQty = Math.max(0, currentAlloc - amount);
  await admin.from("parts").update({ qty_in_stock: newQtyInStock }).eq("id", partId);
  await admin.from("part_allocations").update({ qty: newAllocQty }).eq("part_id", partId).eq("project_id", projectId);
  await admin.from("scan_events").insert({ part_id: partId, project_id: projectId, user_id: profile!.id, action: "add", qty: amount });

  // Keep the Build subsystems' "collected" counters in sync with the allocation
  // we just reduced (e.g. after a disassembly return) so the project/subsystem
  // dashboards stop showing those units as still collected.
  if (opts?.syncBomLines !== false) {
    const { data: projSubs } = await admin.from("subsystems").select("id").eq("project_id", projectId);
    const subIds = (projSubs ?? []).map((s) => s.id);
    if (subIds.length > 0) {
      const { data: collectedLines } = await admin
        .from("bom_lines")
        .select("id, qty_scanned, qty_needed, subsystem_id")
        .eq("matched_part_id", partId)
        .eq("category", "order")
        .gt("qty_scanned", 0)
        .in("subsystem_id", subIds)
        .order("qty_scanned", { ascending: false });
      let remaining = amount;
      const touched = new Set<string>();
      for (const line of collectedLines ?? []) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, line.qty_scanned);
        remaining -= take;
        const newScanned = line.qty_scanned - take;
        if (line.subsystem_id) touched.add(line.subsystem_id);
        if (newScanned === 0 && line.qty_needed === 0) {
          await admin.from("bom_lines").delete().eq("id", line.id);
        } else {
          await admin.from("bom_lines").update({ qty_scanned: newScanned }).eq("id", line.id);
        }
      }
      for (const sid of touched) revalidatePath(`/team/build/subsystem/${sid}`);
    }
  }

  revalidatePath(`/team/build/disassemble/${projectId}`);
  revalidatePath(`/team/build/project/${projectId}`);
  revalidatePath("/team/build");
  return { partName: part.name, moved: amount, newQtyInStock };
}
