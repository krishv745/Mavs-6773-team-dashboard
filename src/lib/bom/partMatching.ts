import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Admin = SupabaseClient<Database>;

/** Trademark/registered/copyright glyphs vendors bake into part names — decorative, not part of the identity. */
export function stripTrademark(text: string): string {
  return text
    .replace(/[®™©]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * A shared-library part's Name often bakes its own SKU on as a trailing
 * suffix (e.g. "1121 Series Low-Side U-Channel (9 Hole, 240mm Length)
 * 1121-0009-0240"). Splits that off so a newly-created part's name doesn't
 * carry a redundant SKU when a real part_number field already has it.
 */
const TRAILING_SKU_RE = /\s+((?:[A-Z]{2,5}-)?\d{2,4}(?:-\d{2,4}){1,3})$/;
/** Same shape as TRAILING_SKU_RE, anchored to the whole string — some rows never got a real Name at all, just the bare SKU (e.g. "1103-0005-0040"), so there's no leading whitespace for the trailing-suffix match to find. */
const BARE_SKU_RE = /^(?:[A-Z]{2,5}-)?\d{2,4}(?:-\d{2,4}){1,3}$/;

function splitTrailingSku(name: string): { base: string; sku: string } | null {
  const match = name.match(TRAILING_SKU_RE);
  if (!match) return null;
  return { base: name.slice(0, match.index).trim(), sku: match[1] };
}

export function cleanPartName(name: string): { base: string; sku: string | null } {
  const stripped = stripTrademark(name);
  const trailing = splitTrailingSku(stripped);
  if (trailing) return { base: trailing.base, sku: trailing.sku };
  if (BARE_SKU_RE.test(stripped)) return { base: stripped, sku: stripped };
  return { base: stripped, sku: null };
}

/**
 * Matches a BOM/vendor-order line to an existing part by part number first
 * (real column, then one extracted from the Name — a vendor/Onshape export's
 * own Part-number column is frequently blank even though the SKU is plainly
 * baked into the name, e.g. "...240mm Length) 1121-0009-0240" or a row whose
 * Name is nothing but the bare SKU), then falls back to an exact link match.
 */
export async function matchExistingPart(
  admin: Admin,
  partNumber: string | null,
  link: string | null,
  nameDerivedPartNumber: string | null,
): Promise<{ id: string; qty_in_stock: number } | null> {
  if (partNumber) {
    const { data } = await admin.from("parts").select("id, qty_in_stock").ilike("part_number", partNumber).maybeSingle();
    if (data) return data;
  }
  if (nameDerivedPartNumber && nameDerivedPartNumber.toLowerCase() !== partNumber?.toLowerCase()) {
    const { data } = await admin
      .from("parts")
      .select("id, qty_in_stock")
      .ilike("part_number", nameDerivedPartNumber)
      .maybeSingle();
    if (data) return data;
  }
  if (link) {
    const { data } = await admin.from("parts").select("id, qty_in_stock").eq("link", link).maybeSingle();
    if (data) return data;
  }
  return null;
}
