"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { parseBomCsv, type ParsedBomRow } from "@/lib/bom/csv";
import { allowedBomFileExtensions } from "@/lib/bom/fileTypes";
import { parseFabricationFilename } from "@/lib/bom/fabricationFilename";
import { cleanPartName, matchExistingPart } from "@/lib/bom/partMatching";
import { manuallyReturnPartAction } from "@/lib/parts/actions";
import { categorizeMaterial } from "@/lib/onshape/materialCategories";
import type { BomImportSource, BomLineCategory, BomLineRow } from "@/lib/supabase/types";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Applies whatever an Order-bucket line's current category implies for its
 * live state — this used to only run once, at a manual "Confirm Import"
 * step. Now that imports are confirmed immediately (see
 * createConfirmedImport) and a line's category can also change later via the
 * checklist's recategorize control, it runs both times: matches/splits an
 * Order line against inventory stock. 3D Print/Custom Cut lines need nothing
 * here — they're checklist-only and never touch the parts catalog.
 */
async function applyCategoryEffects(
  admin: AdminClient,
  line: Pick<BomLineRow, "id" | "name" | "part_number" | "vendor_link" | "qty_needed" | "category" | "matched_part_id">,
): Promise<void> {
  if (line.category !== "order") return;

  let partId = line.matched_part_id;
  if (!partId) {
    const { sku: nameDerivedPartNumber } = cleanPartName(line.name);
    const match = await matchExistingPart(admin, line.part_number, line.vendor_link, nameDerivedPartNumber);
    partId = match?.id ?? null;
  }

  if (partId) {
    const { data: part } = await admin.from("parts").select("qty_in_stock").eq("id", partId).single();
    const stock = part?.qty_in_stock ?? 0;
    const qtyCollect = Math.min(line.qty_needed, stock);
    const qtyOrder = line.qty_needed - qtyCollect;
    await admin
      .from("bom_lines")
      .update({ matched_part_id: partId, qty_collect: qtyCollect, qty_order: qtyOrder })
      .eq("id", line.id);
  } else {
    await admin.from("bom_lines").update({ qty_collect: 0, qty_order: line.qty_needed }).eq("id", line.id);
  }
}

/**
 * Corrects drift between a line's stored collect/order split and the
 * matched part's *current* stock. qty_collect/qty_order are only ever set
 * once — at import, at manual add, or when a line is re-matched/re-
 * categorized — against whatever stock existed at that moment. If that
 * part later gets collected away by another line or project (including via
 * collectFromOtherProjectAction, a disassembly return elsewhere, or a plain
 * manual stock correction), a line can be left claiming stock that no
 * longer exists — showing as "in stock" (or double-listed) when the part is
 * actually now at 0.
 *
 * Only ever shifts the *not-yet-collected* portion (qty_collect -
 * qty_scanned) into qty_order when live stock can't cover it — qty_scanned
 * and qty_fulfilled (both historical facts: what's actually been collected
 * or purchased) are never touched, and nothing changes for a line whose
 * stock is still sufficient. Called from the Subsystem and Project build
 * pages right before rendering so the two boxes always match live stock;
 * returns the same lines with corrected values (and persists the fix)
 * rather than requiring a second fetch.
 */
export async function reconcileOrderLineStock<T extends Pick<BomLineRow, "id" | "category" | "matched_part_id" | "qty_collect" | "qty_order" | "qty_scanned">>(
  lines: T[],
  stockByPartId: Map<string, number>,
): Promise<T[]> {
  const updates: { id: string; qty_collect: number; qty_order: number }[] = [];
  const corrected = lines.map((line) => {
    if (line.category !== "order" || !line.matched_part_id) return line;
    const liveStock = Math.max(0, stockByPartId.get(line.matched_part_id) ?? 0);
    const pendingCollect = Math.max(0, line.qty_collect - line.qty_scanned);
    if (liveStock >= pendingCollect) return line;

    const shortfall = pendingCollect - liveStock;
    const next = { ...line, qty_collect: line.qty_collect - shortfall, qty_order: line.qty_order + shortfall };
    updates.push({ id: next.id, qty_collect: next.qty_collect, qty_order: next.qty_order });
    return next;
  });

  if (updates.length > 0) {
    const admin = createAdminClient();
    await Promise.all(
      updates.map((u) =>
        admin.from("bom_lines").update({ qty_collect: u.qty_collect, qty_order: u.qty_order }).eq("id", u.id),
      ),
    );
  }
  return corrected;
}

async function revalidateBomPaths(admin: AdminClient, bomImportId: string, projectId?: string | null): Promise<void> {
  let pid = projectId ?? null;
  let subsystemId: string | null = null;
  const { data } = await admin.from("bom_imports").select("project_id, subsystem_id").eq("id", bomImportId).maybeSingle();
  if (!pid) pid = data?.project_id ?? null;
  subsystemId = data?.subsystem_id ?? null;
  revalidatePath(`/team/build/bom/${bomImportId}`);
  if (pid) revalidatePath(`/team/build/project/${pid}`);
  if (subsystemId) revalidatePath(`/team/build/subsystem/${subsystemId}`);
  revalidatePath("/team/build");
}

/** One manual-source bom_import per subsystem holds all hand-added COTS lines and put-back markers. */
async function getOrCreateManualImport(
  admin: AdminClient,
  subsystemId: string,
  projectId: string,
  importedBy: string | null,
): Promise<string | null> {
  const { data: existing } = await admin
    .from("bom_imports")
    .select("id")
    .eq("subsystem_id", subsystemId)
    .eq("source", "manual")
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created } = await admin
    .from("bom_imports")
    .insert({
      project_id: projectId,
      subsystem_id: subsystemId,
      source: "manual",
      source_ref: "Manually added",
      status: "confirmed",
      imported_by: importedBy,
    })
    .select("id")
    .single();
  return created?.id ?? null;
}

/**
 * Staff-only. Parses rows, saves them, then immediately matches/splits every
 * line. If the subsystem already has an imported BOM, it is *replaced*:
 * previously-collected COTS quantities are carried into the new BOM (applied
 * toward the new need where it still needs them) and any surplus becomes a
 * "put back" marker line pinned to the top of the In-stock box.
 */
async function createConfirmedImport(
  subsystemId: string,
  source: Exclude<BomImportSource, "manual">,
  sourceRef: string,
  rows: ParsedBomRow[],
  importedBy: string,
): Promise<{ id?: string; error?: string }> {
  const admin = createAdminClient();
  const { data: subsystem } = await admin
    .from("subsystems")
    .select("id, project_id")
    .eq("id", subsystemId)
    .maybeSingle();
  if (!subsystem) return { error: "That subsystem no longer exists." };
  const projectId = subsystem.project_id;

  // Carry forward what was already collected against the old imported BOM.
  const carried = new Map<string, number>();
  const { data: oldImports } = await admin
    .from("bom_imports")
    .select("id")
    .eq("subsystem_id", subsystemId)
    .neq("source", "manual");
  const oldImportIds = (oldImports ?? []).map((i) => i.id);
  if (oldImportIds.length > 0) {
    const { data: oldLines } = await admin
      .from("bom_lines")
      .select("matched_part_id, qty_scanned, category")
      .in("bom_import_id", oldImportIds);
    for (const l of oldLines ?? []) {
      if (l.category !== "order" || !l.matched_part_id || l.qty_scanned <= 0) continue;
      carried.set(l.matched_part_id, (carried.get(l.matched_part_id) ?? 0) + l.qty_scanned);
    }
    await admin.from("bom_imports").delete().in("id", oldImportIds);
  }

  const { data: bomImport, error } = await admin
    .from("bom_imports")
    .insert({
      project_id: projectId,
      subsystem_id: subsystemId,
      source,
      source_ref: sourceRef,
      imported_by: importedBy,
      status: "confirmed",
    })
    .select("id")
    .single();
  if (error || !bomImport) return { error: error?.message ?? "Couldn't start the import." };

  const lines = rows.map((r) => ({
    bom_import_id: bomImport.id,
    subsystem_id: subsystemId,
    name: r.name,
    part_number: r.partNumber,
    material: r.material,
    color: r.color,
    vendor_link: r.vendorLink,
    qty_needed: r.quantity,
    category: categorizeMaterial(r.material, Boolean(r.partNumber || r.vendorLink)),
  }));
  const { error: linesError } = await admin.from("bom_lines").insert(lines);
  if (linesError) return { error: linesError.message };

  const { data: insertedLines } = await admin.from("bom_lines").select("*").eq("bom_import_id", bomImport.id);
  for (const line of insertedLines ?? []) {
    await applyCategoryEffects(admin, line);
  }

  // Reconcile carried-over collected quantities against the fresh lines.
  if (carried.size > 0) {
    const { data: freshLines } = await admin.from("bom_lines").select("*").eq("bom_import_id", bomImport.id);
    for (const line of freshLines ?? []) {
      if (line.category !== "order" || !line.matched_part_id) continue;
      const have = carried.get(line.matched_part_id);
      if (!have) continue;
      const absorbed = Math.min(line.qty_needed, have);
      if (absorbed <= 0) continue;
      const remainingNeed = line.qty_needed - absorbed;
      const { data: part } = await admin.from("parts").select("qty_in_stock").eq("id", line.matched_part_id).maybeSingle();
      const stock = part?.qty_in_stock ?? 0;
      const qtyCollect = Math.min(remainingNeed, stock);
      await admin
        .from("bom_lines")
        .update({ qty_scanned: absorbed, qty_collect: qtyCollect, qty_order: remainingNeed - qtyCollect })
        .eq("id", line.id);
      carried.set(line.matched_part_id, have - absorbed);
    }

    // Anything still carried is surplus — no longer in the BOM (or the BOM
    // needs less). Pin it to the In-stock box as a "put back" marker.
    const surplus = [...carried.entries()].filter(([, qty]) => qty > 0);
    if (surplus.length > 0) {
      const manualImportId = await getOrCreateManualImport(admin, subsystemId, projectId, importedBy);
      if (manualImportId) {
        for (const [partId, qty] of surplus) {
          const { data: part } = await admin
            .from("parts")
            .select("name, part_number, link")
            .eq("id", partId)
            .maybeSingle();
          if (!part) continue;
          await admin.from("bom_lines").insert({
            bom_import_id: manualImportId,
            subsystem_id: subsystemId,
            name: part.name,
            part_number: part.part_number,
            vendor_link: part.link,
            category: "order",
            matched_part_id: partId,
            qty_needed: 0,
            qty_collect: 0,
            qty_order: 0,
            qty_scanned: qty,
          });
        }
      }
    }
  }

  revalidatePath(`/team/build/project/${projectId}`);
  revalidatePath(`/team/build/subsystem/${subsystemId}`);
  revalidatePath("/team/build");
  return { id: bomImport.id };
}

/** Staff-only. Parses an uploaded Onshape BOM CSV export and starts an import — immediately matched and ready as a checklist. */
export async function startBomImportFromCsvAction(
  subsystemId: string,
  filename: string,
  csvText: string,
): Promise<{ id?: string; error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };
  if (!subsystemId) return { error: "Pick a subsystem first." };

  let rows: ParsedBomRow[];
  try {
    rows = parseBomCsv(csvText);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't read that CSV." };
  }
  if (rows.length === 0) return { error: "That CSV has no rows." };

  return createConfirmedImport(subsystemId, "csv", filename, rows, profile!.id);
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const EXTRACT_BOM_TOOL: Anthropic.Tool = {
  name: "extract_bom_rows",
  description: "Report whether this page is an Onshape login page, and if not, extract every BOM line item found in it.",
  input_schema: {
    type: "object",
    properties: {
      is_login_page: {
        type: "boolean",
        description: "True if this text is an Onshape sign-in/account page rather than actual document/BOM content.",
      },
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            part_number: { type: "string", description: "Omit if not present." },
            material: { type: "string", description: "Omit if not present." },
            color: { type: "string", description: "Omit if not present." },
            vendor_link: { type: "string", description: "A vendor product URL for this part, if present." },
            quantity: { type: "number" },
          },
          required: ["name"],
        },
      },
    },
    required: ["is_login_page", "rows"],
  },
};

/** Staff-only. Fetches a pasted Onshape document link server-side and asks Claude to extract BOM rows from the page text (no Onshape API involved — only works for a publicly-shared document). */
export async function startBomImportFromLinkAction(
  subsystemId: string,
  url: string,
): Promise<{ id?: string; error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };
  if (!subsystemId) return { error: "Pick a subsystem first." };
  if (!url.trim()) return { error: "Paste an Onshape document link first." };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "Reading a link isn't set up yet — ask an Owner to add an ANTHROPIC_API_KEY, or upload a CSV instead." };
  }

  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Mavericks6773Bot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    html = await res.text();
  } catch {
    return { error: "Couldn't reach that link." };
  }

  const text = htmlToText(html).slice(0, 15000);
  if (!text) return { error: "That page had no readable content." };

  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      tools: [EXTRACT_BOM_TOOL],
      tool_choice: { type: "tool", name: "extract_bom_rows" },
      system:
        "You extract Bill-of-Materials rows from the raw text of a fetched Onshape document page. If the text looks like an Onshape sign-in/login/account page (auth UI, no actual document or BOM table content) rather than a real document, set is_login_page true and return an empty rows array — do not guess. Otherwise extract every BOM line item you can find with its name, part number, material, color, vendor link, and quantity where present.",
      messages: [{ role: "user", content: `Page text:\n\n${text}` }],
    });
  } catch {
    return { error: "Couldn't reach the extraction service. Try again in a moment." };
  }

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") return { error: "Couldn't read that document." };

  const input = toolBlock.input as { is_login_page?: boolean; rows?: Array<Record<string, unknown>> };
  if (input.is_login_page) {
    return { error: 'Couldn\'t read that document — check it\'s shared publicly ("Anyone with the link can view") in Onshape.' };
  }

  const rows: ParsedBomRow[] = (input.rows ?? [])
    .map((r) => ({
      name: String(r.name ?? "").trim(),
      partNumber: r.part_number ? String(r.part_number).trim() : null,
      vendorLink: r.vendor_link ? String(r.vendor_link).trim() : null,
      quantity: typeof r.quantity === "number" && r.quantity > 0 ? Math.round(r.quantity) : 1,
      material: r.material ? String(r.material).trim() : null,
      color: r.color ? String(r.color).trim() : null,
    }))
    .filter((r) => r.name);

  if (rows.length === 0) return { error: "That document's BOM has no rows." };

  return createConfirmedImport(subsystemId, "onshape_link", url, rows, profile!.id);
}

/** Staff-only. Moves a line to a different category — re-runs the same matching logic a fresh import would apply, so a corrected line is immediately actionable. */
export async function updateBomLineCategoryAction(
  lineId: string,
  category: BomLineCategory,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: line } = await admin.from("bom_lines").select("*").eq("id", lineId).maybeSingle();
  if (!line) return { error: "That line no longer exists." };

  const { error } = await admin.from("bom_lines").update({ category }).eq("id", lineId);
  if (error) return { error: error.message };

  await applyCategoryEffects(admin, { ...line, category });

  await revalidateBomPaths(admin, line.bom_import_id);
  return {};
}

/**
 * Staff-only. Drops a single line — a bad/duplicate row from a messy export,
 * or one no longer needed. If the line has parts already collected against it,
 * deleting it outright would orphan that project allocation, so the caller
 * must first confirm whether to return those parts to inventory: without
 * `returnCollected` set, this reports `needsReturnConfirm` and deletes nothing.
 */
export async function deleteBomLineAction(
  lineId: string,
  returnCollected?: boolean,
): Promise<{ error?: string; needsReturnConfirm?: boolean; collectedQty?: number }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: line } = await admin
    .from("bom_lines")
    .select("bom_import_id, matched_part_id, qty_scanned")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return {};

  const hasCollected = line.qty_scanned > 0 && Boolean(line.matched_part_id);
  if (hasCollected && !returnCollected) {
    return { needsReturnConfirm: true, collectedQty: line.qty_scanned };
  }
  if (hasCollected && returnCollected) {
    const { data: imp } = await admin.from("bom_imports").select("project_id").eq("id", line.bom_import_id).maybeSingle();
    if (imp) {
      await manuallyReturnPartAction(imp.project_id, line.matched_part_id!, line.qty_scanned, { syncBomLines: false });
    }
  }

  const { error } = await admin.from("bom_lines").delete().eq("id", lineId);
  if (error) return { error: error.message };

  await revalidateBomPaths(admin, line.bom_import_id);
  return {};
}

/** Staff-only. Marks a 3D-Print ("Printed") or Custom-Cut ("Collected") checklist line done/not-done — a plain checkbox, no parts-catalog row involved. */
export async function updateBomLineCollectedAction(lineId: string, collected: boolean): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: line } = await admin.from("bom_lines").select("bom_import_id").eq("id", lineId).maybeSingle();
  const { error } = await admin.from("bom_lines").update({ collected }).eq("id", lineId);
  if (error) return { error: error.message };

  if (line) await revalidateBomPaths(admin, line.bom_import_id);
  return {};
}

/**
 * Staff-only. Marks a chosen quantity of a COTS line as brought to the
 * project without scanning — for when scanning isn't practical. Performs
 * the same inventory move a scan would (decrement the matched part's stock,
 * credit this project's allocation). The caller picks the quantity (the UI
 * defaults it to whatever's left to collect, capped by current stock, but
 * staff can dial it up or down) — only hard-capped here at current stock,
 * since collecting more than physically exists isn't possible.
 */
export type ManualCollectResult = { error?: string; partName?: string; moved?: number; newQtyInStock?: number };

export async function manuallyCollectBomLineAction(lineId: string, qty: number): Promise<ManualCollectResult> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: line } = await admin
    .from("bom_lines")
    .select("bom_import_id, matched_part_id, qty_scanned")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { error: "That line no longer exists." };
  if (!line.matched_part_id) return { error: "No matched part to collect." };

  const requested = Math.max(0, Math.round(qty));
  if (requested <= 0) return {};

  const { data: bomImport } = await admin.from("bom_imports").select("project_id").eq("id", line.bom_import_id).maybeSingle();
  if (!bomImport) return { error: "That import no longer exists." };

  const { data: part } = await admin.from("parts").select("name, qty_in_stock").eq("id", line.matched_part_id).maybeSingle();
  const stock = part?.qty_in_stock ?? 0;
  const moved = Math.min(requested, stock);
  const newQtyInStock = stock - moved;
  if (moved > 0) {
    await admin.from("parts").update({ qty_in_stock: newQtyInStock }).eq("id", line.matched_part_id);
    const { data: alloc } = await admin
      .from("part_allocations")
      .select("qty")
      .eq("part_id", line.matched_part_id)
      .eq("project_id", bomImport.project_id)
      .maybeSingle();
    await admin
      .from("part_allocations")
      .upsert(
        { part_id: line.matched_part_id, project_id: bomImport.project_id, qty: (alloc?.qty ?? 0) + moved },
        { onConflict: "part_id,project_id" },
      );
  }

  await admin.from("bom_lines").update({ qty_scanned: line.qty_scanned + moved }).eq("id", lineId);

  await revalidateBomPaths(admin, line.bom_import_id, bomImport.project_id);
  return { partName: part?.name, moved, newQtyInStock };
}

/**
 * Staff-only. Manually links an Order-bucket line to an existing part when
 * automatic part-number/vendor-link matching found nothing. Recomputes the
 * Collect/Order split against that part's current stock.
 */
export async function linkBomLineToPartAction(lineId: string, partId: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: line } = await admin.from("bom_lines").select("bom_import_id, qty_needed").eq("id", lineId).maybeSingle();
  if (!line) return { error: "That line no longer exists." };

  const { data: part } = await admin.from("parts").select("qty_in_stock").eq("id", partId).maybeSingle();
  const stock = part?.qty_in_stock ?? 0;
  const qtyCollect = Math.min(line.qty_needed, stock);
  const qtyOrder = line.qty_needed - qtyCollect;

  const { error } = await admin
    .from("bom_lines")
    .update({ matched_part_id: partId, qty_collect: qtyCollect, qty_order: qtyOrder })
    .eq("id", lineId);
  if (error) return { error: error.message };

  await revalidateBomPaths(admin, line.bom_import_id);
  return {};
}

/**
 * Staff-only. Records that a "Need to purchase" shortfall was bought — restocks
 * the matched part (creating it first, from the line's name/part number/vendor
 * link, if nothing matched yet) and converts the purchased amount from Order
 * into Collect, so the existing Mark Collected button can pull it onto the
 * project same as any other COTS part.
 */
export async function markLineAsPurchasedAction(lineId: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: line } = await admin
    .from("bom_lines")
    .select("bom_import_id, name, part_number, vendor_link, matched_part_id, qty_collect, qty_order, qty_fulfilled")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { error: "That line no longer exists." };

  const amount = line.qty_order - line.qty_fulfilled;
  if (amount <= 0) return {};

  let partId = line.matched_part_id;
  if (!partId) {
    const { data: newPart, error: createError } = await admin
      .from("parts")
      .insert({ name: line.name, part_number: line.part_number, link: line.vendor_link, qty_in_stock: amount })
      .select("id")
      .single();
    if (createError || !newPart) return { error: createError?.message ?? "Couldn't create that part." };
    partId = newPart.id;
  } else {
    const { data: part } = await admin.from("parts").select("qty_in_stock").eq("id", partId).maybeSingle();
    await admin.from("parts").update({ qty_in_stock: (part?.qty_in_stock ?? 0) + amount }).eq("id", partId);
  }

  const { error } = await admin
    .from("bom_lines")
    .update({
      matched_part_id: partId,
      qty_collect: line.qty_collect + amount,
      qty_order: line.qty_order - amount,
      qty_fulfilled: line.qty_fulfilled + amount,
    })
    .eq("id", lineId);
  if (error) return { error: error.message };

  await revalidateBomPaths(admin, line.bom_import_id);
  return {};
}

/**
 * Marks a chosen quantity of a "for purchase" line as already in hand —
 * someone had some sitting around, or picked them up without a formal
 * order — without waiting on markLineAsPurchasedAction's full-remaining,
 * two-step (restock, then separately Mark Collected) flow. Creates the
 * catalog part first if the line was never matched to one (same as
 * markLineAsPurchasedAction), then goes straight to this project's
 * allocation and marks it collected in one step — general stock is never
 * touched, since these units never passed through it.
 */
export async function manuallyCollectPurchaseLineAction(
  lineId: string,
  qty: number,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: line } = await admin
    .from("bom_lines")
    .select("bom_import_id, name, part_number, vendor_link, matched_part_id, qty_collect, qty_order, qty_fulfilled, qty_scanned")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { error: "That line no longer exists." };

  const stillNeeded = Math.max(0, line.qty_order - line.qty_fulfilled);
  const amount = Math.min(Math.max(0, Math.round(qty)), stillNeeded);
  if (amount <= 0) return { error: "Nothing to collect." };

  const { data: bomImport } = await admin
    .from("bom_imports")
    .select("project_id")
    .eq("id", line.bom_import_id)
    .maybeSingle();
  if (!bomImport) return { error: "That import no longer exists." };

  let partId = line.matched_part_id;
  if (!partId) {
    const { data: newPart, error: createError } = await admin
      .from("parts")
      .insert({ name: line.name, part_number: line.part_number, link: line.vendor_link, qty_in_stock: 0 })
      .select("id")
      .single();
    if (createError || !newPart) return { error: createError?.message ?? "Couldn't create that part." };
    partId = newPart.id;
  }

  const { data: alloc } = await admin
    .from("part_allocations")
    .select("qty")
    .eq("part_id", partId)
    .eq("project_id", bomImport.project_id)
    .maybeSingle();
  await admin
    .from("part_allocations")
    .upsert(
      { part_id: partId, project_id: bomImport.project_id, qty: (alloc?.qty ?? 0) + amount },
      { onConflict: "part_id,project_id" },
    );

  const { error } = await admin
    .from("bom_lines")
    .update({
      matched_part_id: partId,
      qty_collect: line.qty_collect + amount,
      qty_order: line.qty_order - amount,
      qty_fulfilled: line.qty_fulfilled + amount,
      qty_scanned: line.qty_scanned + amount,
    })
    .eq("id", lineId);
  if (error) return { error: error.message };

  await admin.from("scan_events").insert({
    part_id: partId,
    project_id: bomImport.project_id,
    user_id: profile!.id,
    action: "add",
    qty: amount,
  });

  await revalidateBomPaths(admin, line.bom_import_id, bomImport.project_id);
  return {};
}

export type OtherProjectAllocation = { projectId: string; projectName: string; qty: number };

/**
 * For every given part, how many units are sitting on OTHER projects'
 * allocations — shown next to a "for purchase" line's "buy N" as "Collect N
 * from X" so a shortfall can be covered by borrowing already-collected
 * stock instead of placing a new order. One batched pair of queries for
 * every purchase line's matched part at once (rather than one query per
 * line) — quantities here are each project's raw allocation; the caller
 * caps what it displays/sends to collectFromOtherProjectAction at whatever
 * that specific line still needs (qty_order - qty_fulfilled), since that
 * varies per line even for the same part.
 */
export async function getOtherProjectAllocationsByPart(
  partIds: string[],
  excludeProjectId: string,
): Promise<Map<string, OtherProjectAllocation[]>> {
  const result = new Map<string, OtherProjectAllocation[]>();
  if (partIds.length === 0) return result;

  const admin = createAdminClient();
  const { data: allocs } = await admin
    .from("part_allocations")
    .select("part_id, project_id, qty")
    .in("part_id", partIds)
    .neq("project_id", excludeProjectId)
    .gt("qty", 0);
  if (!allocs || allocs.length === 0) return result;

  const { data: projects } = await admin
    .from("projects")
    .select("id, name")
    .in("id", [...new Set(allocs.map((a) => a.project_id))]);
  const nameById = new Map((projects ?? []).map((p) => [p.id, p.name]));

  for (const a of allocs) {
    const list = result.get(a.part_id) ?? [];
    list.push({ projectId: a.project_id, projectName: nameById.get(a.project_id) ?? "another project", qty: a.qty });
    result.set(a.part_id, list);
  }
  return result;
}

/**
 * Moves units of a "for purchase" line's matched part straight from another
 * project's allocation into this one, in one click: debits the other
 * project (and syncs its own BOM lines down, same as a manual return — see
 * manuallyReturnPartAction) and, on this line, converts that amount from
 * Order into Collect *and* marks it collected immediately (qty_scanned),
 * since physically the units are already in hand — there's nothing left to
 * separately "mark collected" afterward, unlike markLineAsPurchasedAction's
 * restock-then-collect two-step for an actual purchase.
 */
export async function collectFromOtherProjectAction(
  lineId: string,
  fromProjectId: string,
  qty: number,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: line } = await admin
    .from("bom_lines")
    .select("bom_import_id, matched_part_id, qty_collect, qty_order, qty_fulfilled, qty_scanned")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { error: "That line no longer exists." };
  if (!line.matched_part_id) return { error: "No matched part on this line." };

  const { data: bomImport } = await admin
    .from("bom_imports")
    .select("project_id")
    .eq("id", line.bom_import_id)
    .maybeSingle();
  if (!bomImport) return { error: "That import no longer exists." };
  const toProjectId = bomImport.project_id;
  if (fromProjectId === toProjectId) return { error: "That's already this project." };

  const { data: fromAlloc } = await admin
    .from("part_allocations")
    .select("qty")
    .eq("part_id", line.matched_part_id)
    .eq("project_id", fromProjectId)
    .maybeSingle();
  const available = fromAlloc?.qty ?? 0;
  const stillNeeded = Math.max(0, line.qty_order - line.qty_fulfilled);
  const amount = Math.min(Math.max(0, Math.round(qty)), available, stillNeeded);
  if (amount <= 0) return { error: "Nothing to collect." };

  // Take it from the other project — this already restocks general
  // inventory, debits its allocation, logs a scan event, and syncs that
  // project's own "collected" BOM lines down, exactly like a normal
  // put-back. The immediate re-collect below (general stock → this
  // project) nets that restock back out to zero, so it's never actually
  // visible as available general stock in between.
  const returned = await manuallyReturnPartAction(fromProjectId, line.matched_part_id, amount, {
    syncBomLines: true,
  });
  if (returned.error) return { error: returned.error };
  const moved = returned.moved ?? amount;
  if (moved <= 0) return { error: "Nothing to collect." };

  const { data: part } = await admin.from("parts").select("qty_in_stock").eq("id", line.matched_part_id).maybeSingle();
  await admin
    .from("parts")
    .update({ qty_in_stock: Math.max(0, (part?.qty_in_stock ?? 0) - moved) })
    .eq("id", line.matched_part_id);

  const { data: toAlloc } = await admin
    .from("part_allocations")
    .select("qty")
    .eq("part_id", line.matched_part_id)
    .eq("project_id", toProjectId)
    .maybeSingle();
  await admin
    .from("part_allocations")
    .upsert(
      { part_id: line.matched_part_id, project_id: toProjectId, qty: (toAlloc?.qty ?? 0) + moved },
      { onConflict: "part_id,project_id" },
    );

  await admin
    .from("bom_lines")
    .update({
      qty_collect: line.qty_collect + moved,
      qty_order: line.qty_order - moved,
      qty_fulfilled: line.qty_fulfilled + moved,
      qty_scanned: line.qty_scanned + moved,
    })
    .eq("id", lineId);

  await admin.from("scan_events").insert({
    part_id: line.matched_part_id,
    project_id: toProjectId,
    user_id: profile!.id,
    action: "add",
    qty: moved,
  });

  await revalidateBomPaths(admin, line.bom_import_id, toProjectId);
  return {};
}

/** Staff-only. Fills in a 3D Print/Custom Cut line's material or color when the BOM didn't specify one (or to correct it). */
export async function updateBomLineFieldAction(
  lineId: string,
  field: "material" | "color",
  value: string | null,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: line } = await admin.from("bom_lines").select("bom_import_id").eq("id", lineId).maybeSingle();
  const cleaned = value?.trim() || null;
  const update = field === "material" ? { material: cleaned } : { color: cleaned };
  const { error } = await admin.from("bom_lines").update(update).eq("id", lineId);
  if (error) return { error: error.message };

  if (line) await revalidateBomPaths(admin, line.bom_import_id);
  return {};
}

/**
 * Staff-only. Uploads a 3D-print / custom-cut file straight into a subsystem
 * (no BOM line needed first). The filename is parsed into a new fabrication
 * BOM line — 3d_print: PARTNAME_COLOR_QTY_MATERIAL, custom_cut: PARTNAME_QTY_MATERIAL
 * — which the file is then attached to.
 */
export async function uploadFabricationFileAction(
  subsystemId: string,
  category: "3d_print" | "custom_cut",
  formData: FormData,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file first." };

  const allowed = allowedBomFileExtensions(category);
  const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  if (allowed && !allowed.includes(ext)) {
    return { error: `That file type isn't allowed here — use ${allowed.join(", ")}.` };
  }

  const admin = createAdminClient();
  const { data: subsystem } = await admin
    .from("subsystems")
    .select("id, project_id")
    .eq("id", subsystemId)
    .maybeSingle();
  if (!subsystem) return { error: "That subsystem no longer exists." };

  const manualImportId = await getOrCreateManualImport(admin, subsystemId, subsystem.project_id, profile!.id);
  if (!manualImportId) return { error: "Couldn't add that part." };

  const parsed = parseFabricationFilename(file.name, category);
  const { data: line, error: lineError } = await admin
    .from("bom_lines")
    .insert({
      bom_import_id: manualImportId,
      subsystem_id: subsystemId,
      name: parsed.name,
      color: parsed.color,
      material: parsed.material,
      category,
      qty_needed: parsed.qty,
    })
    .select("id")
    .single();
  if (lineError || !line) return { error: lineError?.message ?? "Couldn't create that part." };

  const result = await uploadBomLineFileAction(line.id, formData);
  if (result.error) {
    await admin.from("bom_lines").delete().eq("id", line.id);
    return { error: result.error };
  }

  await revalidateBomPaths(admin, manualImportId, subsystem.project_id);
  return {};
}

export type BomLineFileResult = { error?: string; file?: { id: string; url: string; filename: string } };

/** Staff-only. Attaches a design/drawing file to a 3D Print or Custom Cut line — extension is checked against that category's allowed list server-side, not just the client's file picker. */
export async function uploadBomLineFileAction(lineId: string, formData: FormData): Promise<BomLineFileResult> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file first." };

  const admin = createAdminClient();
  const { data: line } = await admin.from("bom_lines").select("bom_import_id, category").eq("id", lineId).maybeSingle();
  if (!line) return { error: "That line no longer exists." };

  const allowed = allowedBomFileExtensions(line.category);
  const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  if (allowed && !allowed.includes(ext)) {
    return { error: `That file type isn't allowed here — use ${allowed.join(", ")}.` };
  }

  const path = `${lineId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await admin.storage.from("bom-line-files").upload(path, file, { contentType: file.type });
  if (uploadError) return { error: uploadError.message };

  const { data: publicUrl } = admin.storage.from("bom-line-files").getPublicUrl(path);
  const { data: fileRow, error } = await admin
    .from("bom_line_files")
    .insert({ bom_line_id: lineId, url: publicUrl.publicUrl, filename: file.name, content_type: file.type, uploaded_by: profile!.id })
    .select("id, url, filename")
    .single();
  if (error || !fileRow) return { error: error?.message ?? "Couldn't save that file." };

  await revalidateBomPaths(admin, line.bom_import_id);
  return { file: fileRow };
}

/**
 * Staff-only. Adds a COTS part to a subsystem straight from inventory (not
 * via a BOM).
 *
 * Splits the requested quantity against what's actually on the shelf right
 * now, same as linkBomLineToPartAction: whatever's on hand covers "collect",
 * any shortfall (all of it, if this part has 0 in stock or was never given a
 * stock count) lands on "COTS Parts (for purchase)" instead of forcing a
 * fake "collected" beyond what's real.
 *
 * `markCollected` (default true) controls only the on-hand portion: true
 * pulls it from stock into the project's allocation immediately ("Mark as
 * collected"); false leaves it on the checklist for later ("Add to
 * collection list"). Either way the shortfall portion, if any, still needs
 * a purchase.
 */
export async function addManualCotsLineAction(
  subsystemId: string,
  partId: string,
  qty: number,
  markCollected: boolean = true,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const amount = Math.max(1, Math.round(qty || 0));
  const admin = createAdminClient();

  const { data: subsystem } = await admin
    .from("subsystems")
    .select("id, project_id")
    .eq("id", subsystemId)
    .maybeSingle();
  if (!subsystem) return { error: "That subsystem no longer exists." };

  const { data: part } = await admin
    .from("parts")
    .select("name, part_number, link, qty_in_stock")
    .eq("id", partId)
    .maybeSingle();
  if (!part) return { error: "That part no longer exists." };

  // Same collect/order split as linkBomLineToPartAction: whatever's actually
  // on the shelf covers "collect", the shortfall (all of it, if this part
  // has 0 or wasn't given a stock count) lands in "for purchase" — no more
  // forcing a fake "mark collected" beyond what's really in stock.
  const onHand = Math.max(0, part.qty_in_stock);
  const qtyCollect = Math.min(amount, onHand);
  const qtyOrder = amount - qtyCollect;
  const scannedNow = markCollected ? qtyCollect : 0;

  const manualImportId = await getOrCreateManualImport(admin, subsystemId, subsystem.project_id, profile!.id);
  if (!manualImportId) return { error: "Couldn't add that part." };

  const { data: line, error } = await admin
    .from("bom_lines")
    .insert({
      bom_import_id: manualImportId,
      subsystem_id: subsystemId,
      name: part.name,
      part_number: part.part_number,
      vendor_link: part.link,
      category: "order",
      matched_part_id: partId,
      qty_needed: amount,
      qty_collect: qtyCollect,
      qty_order: qtyOrder,
      qty_scanned: scannedNow,
    })
    .select("id")
    .single();
  if (error || !line) return { error: error?.message ?? "Couldn't add that part." };

  if (scannedNow > 0) {
    await admin.from("parts").update({ qty_in_stock: Math.max(0, part.qty_in_stock - scannedNow) }).eq("id", partId);
    const { data: alloc } = await admin
      .from("part_allocations")
      .select("qty")
      .eq("part_id", partId)
      .eq("project_id", subsystem.project_id)
      .maybeSingle();
    await admin
      .from("part_allocations")
      .upsert(
        { part_id: partId, project_id: subsystem.project_id, qty: (alloc?.qty ?? 0) + scannedNow },
        { onConflict: "part_id,project_id" },
      );
  }

  await revalidateBomPaths(admin, manualImportId, subsystem.project_id);
  return {};
}

/**
 * Staff-only. Returns a surplus "put back" marker line's quantity to general
 * inventory (restocks it, debits the project's allocation) and clears the
 * marker. Also handles an over-collected real line (returns just the excess).
 */
export async function putBackSurplusAction(lineId: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: line } = await admin
    .from("bom_lines")
    .select("bom_import_id, matched_part_id, qty_scanned, qty_needed, qty_collect")
    .eq("id", lineId)
    .maybeSingle();
  if (!line || !line.matched_part_id) return { error: "Nothing to put back." };

  const surplus = line.qty_scanned - Math.max(0, line.qty_needed);
  if (surplus <= 0) return {};

  const { data: bomImport } = await admin
    .from("bom_imports")
    .select("project_id")
    .eq("id", line.bom_import_id)
    .maybeSingle();
  if (!bomImport) return { error: "That import no longer exists." };

  await manuallyReturnPartAction(bomImport.project_id, line.matched_part_id, surplus, { syncBomLines: false });

  if (line.qty_needed <= 0) {
    await admin.from("bom_lines").delete().eq("id", lineId);
  } else {
    await admin.from("bom_lines").update({ qty_scanned: line.qty_needed }).eq("id", lineId);
  }

  await revalidateBomPaths(admin, line.bom_import_id, bomImport.project_id);
  return {};
}

/**
 * Staff-only. Returns an "orphan" project allocation — units still allocated
 * to the project with no BOM line accounting for them (e.g. left behind by an
 * older disassembly return, or a deleted line from before the return prompt) —
 * back to general inventory.
 */
export async function putBackOrphanAllocationAction(
  projectId: string,
  partId: string,
  qty: number,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const amount = Math.max(0, Math.round(qty));
  if (amount <= 0) return {};

  await manuallyReturnPartAction(projectId, partId, amount, { syncBomLines: false });
  revalidatePath(`/team/build/project/${projectId}`);
  revalidatePath("/team/build");
  return {};
}

/** Staff-only. Removes an attached file. */
export async function deleteBomLineFileAction(fileId: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: fileRow } = await admin.from("bom_line_files").select("bom_line_id").eq("id", fileId).maybeSingle();
  if (!fileRow) return {};

  const { data: line } = await admin.from("bom_lines").select("bom_import_id").eq("id", fileRow.bom_line_id).maybeSingle();
  const { error } = await admin.from("bom_line_files").delete().eq("id", fileId);
  if (error) return { error: error.message };

  if (line) await revalidateBomPaths(admin, line.bom_import_id);
  return {};
}
