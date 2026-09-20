"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { parseVendorOrderCsv, type ParsedVendorOrderRow } from "@/lib/bom/csv";
import { cleanPartName, matchExistingPart } from "@/lib/bom/partMatching";

/** Staff-only. Parses an uploaded vendor-order CSV export into a client-side-editable preview — nothing is written yet. */
export async function parseVendorOrderCsvAction(
  csvText: string,
): Promise<{ rows?: ParsedVendorOrderRow[]; error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  try {
    const rows = parseVendorOrderCsv(csvText);
    if (rows.length === 0) return { error: "That CSV has no rows." };
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't read that CSV." };
  }
}

const EXTRACT_ORDER_TOOL: Anthropic.Tool = {
  name: "extract_order_lines",
  description: "Extract the actual purchased line items from the raw text of a vendor order/invoice page.",
  input_schema: {
    type: "object",
    properties: {
      rows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            part_name: { type: "string" },
            part_number: { type: "string", description: "SKU, omit if not present." },
            quantity: { type: "number" },
          },
          required: ["part_name", "quantity"],
        },
      },
    },
    required: ["rows"],
  },
};

/**
 * Staff-only. Extracts raw text from an uploaded PDF and asks Claude to
 * pull out just the line items — vendor order pages vary wildly in layout
 * (a clean invoice vs. a saved account-order page full of nav/address/
 * tracking noise), so this is structured extraction rather than a per-vendor
 * regex parser. Nothing is written; the caller reviews before confirming.
 */
export async function extractVendorOrderPdfAction(
  base64: string,
): Promise<{ rows?: ParsedVendorOrderRow[]; error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "Reading a PDF isn't set up yet — ask an Owner to add an ANTHROPIC_API_KEY, or upload a CSV instead." };
  }

  let text: string;
  try {
    const { PDFParse } = await import("pdf-parse");
    const buffer = Buffer.from(base64, "base64");
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    text = result.text;
  } catch {
    return { error: "Couldn't read that PDF." };
  }
  if (!text.trim()) return { error: "That PDF had no readable text." };

  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      tools: [EXTRACT_ORDER_TOOL],
      tool_choice: { type: "tool", name: "extract_order_lines" },
      system:
        "You extract purchased line items from the raw text of a vendor order/invoice PDF. This text may be a clean invoice, or a saved account order-history page full of unrelated noise (nav menu links, account/shipping addresses, tracking numbers, subtotal/shipping/total lines) — extract only the actual ordered parts (each usually shown with a quantity and a price, often with 'SKU:' or 'Part #' beside it), and ignore everything else. Don't include totals, addresses, or navigation text as rows.",
      messages: [{ role: "user", content: `PDF text:\n\n${text.slice(0, 15000)}` }],
    });
  } catch {
    return { error: "Couldn't reach the extraction service. Try again in a moment." };
  }

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") return { error: "Couldn't read that PDF." };

  const input = toolBlock.input as { rows?: Array<Record<string, unknown>> };
  const rows: ParsedVendorOrderRow[] = (input.rows ?? [])
    .map((r) => ({
      partName: String(r.part_name ?? "").trim(),
      partNumber: r.part_number ? String(r.part_number).trim() : null,
      link: null,
      quantity: typeof r.quantity === "number" && r.quantity > 0 ? Math.round(r.quantity) : 1,
    }))
    .filter((r) => r.partName);

  if (rows.length === 0) return { error: "Couldn't find any line items in that PDF." };
  return { rows };
}

export type ReceiveVendorOrderResult = { error?: string; allocatedToProject: number; addedToStock: number };

/**
 * Staff-only. Writes a reviewed/confirmed set of received-order rows: each
 * line matches against inventory (part number, then a SKU extracted from
 * the name, then link) the same way BOM import does. If tied to a
 * bom_import, fills that part's outstanding Order shortfall directly into
 * the project's allocations (bypassing the scan step — receiving the order
 * *is* the confirmation) and reduces qty_order's outstanding amount; any
 * remainder (or the whole quantity, if not tied to a BOM) adds to general
 * stock. An unmatched line creates a new part first.
 */
export async function receiveVendorOrderAction(
  vendor: string | null,
  orderReference: string | null,
  bomImportId: string | null,
  rows: ParsedVendorOrderRow[],
): Promise<ReceiveVendorOrderResult> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized.", allocatedToProject: 0, addedToStock: 0 };
  if (rows.length === 0) return { error: "Nothing to receive.", allocatedToProject: 0, addedToStock: 0 };

  const admin = createAdminClient();

  let bomProjectId: string | null = null;
  if (bomImportId) {
    const { data: bomImport } = await admin.from("bom_imports").select("project_id").eq("id", bomImportId).maybeSingle();
    bomProjectId = bomImport?.project_id ?? null;
  }

  const { data: vendorOrder, error: orderError } = await admin
    .from("vendor_orders")
    .insert({ vendor, order_reference: orderReference, bom_import_id: bomImportId, imported_by: profile!.id })
    .select("id")
    .single();
  if (orderError || !vendorOrder) return { error: orderError?.message ?? "Couldn't save this order.", allocatedToProject: 0, addedToStock: 0 };

  let allocatedToProject = 0;
  let addedToStock = 0;

  for (const row of rows) {
    const { sku: nameDerivedPartNumber } = cleanPartName(row.partName);
    let match = await matchExistingPart(admin, row.partNumber, row.link, nameDerivedPartNumber);

    let partId: string;
    if (match) {
      partId = match.id;
    } else {
      const { base, sku } = cleanPartName(row.partName);
      const { data: newPart } = await admin
        .from("parts")
        .insert({
          name: base,
          part_number: row.partNumber ?? sku,
          link: row.link,
          qty_in_stock: 0,
        })
        .select("id, qty_in_stock")
        .single();
      if (!newPart) continue;
      partId = newPart.id;
      match = newPart;
    }

    await admin.from("vendor_order_lines").insert({
      vendor_order_id: vendorOrder.id,
      part_name: row.partName,
      part_number: row.partNumber,
      link: row.link,
      qty_ordered: row.quantity,
      matched_part_id: partId,
    });

    let remainder = row.quantity;

    if (bomImportId && bomProjectId) {
      const { data: candidateLines } = await admin
        .from("bom_lines")
        .select("id, qty_order, qty_fulfilled")
        .eq("bom_import_id", bomImportId)
        .eq("matched_part_id", partId)
        .eq("category", "order");
      const bomLine = (candidateLines ?? []).find((l) => l.qty_fulfilled < l.qty_order);

      if (bomLine) {
        const outstanding = bomLine.qty_order - bomLine.qty_fulfilled;
        const toAllocate = Math.min(remainder, outstanding);
        if (toAllocate > 0) {
          const { data: alloc } = await admin
            .from("part_allocations")
            .select("qty")
            .eq("part_id", partId)
            .eq("project_id", bomProjectId)
            .maybeSingle();
          await admin
            .from("part_allocations")
            .upsert(
              { part_id: partId, project_id: bomProjectId, qty: (alloc?.qty ?? 0) + toAllocate },
              { onConflict: "part_id,project_id" },
            );
          await admin.from("bom_lines").update({ qty_fulfilled: bomLine.qty_fulfilled + toAllocate }).eq("id", bomLine.id);
          remainder -= toAllocate;
          allocatedToProject += toAllocate;
        }
      }
    }

    if (remainder > 0) {
      await admin.from("parts").update({ qty_in_stock: match.qty_in_stock + remainder }).eq("id", partId);
      addedToStock += remainder;
    }
  }

  revalidatePath("/team/build");
  if (bomImportId) revalidatePath(`/team/build/bom/${bomImportId}`);
  return { allocatedToProject, addedToStock };
}
