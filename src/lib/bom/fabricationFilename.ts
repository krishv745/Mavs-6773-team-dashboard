import type { BomLineCategory } from "@/lib/supabase/types";

export type ParsedFabricationName = {
  name: string;
  color: string | null;
  material: string | null;
  qty: number;
};

const stripExt = (filename: string) => filename.replace(/\.[a-z0-9]+$/i, "");
const lastIntIndex = (tokens: string[]) => {
  for (let i = tokens.length - 1; i >= 0; i--) if (/^\d+$/.test(tokens[i])) return i;
  return -1;
};

/**
 * Parses an uploaded fabrication filename into a BOM line.
 * 3D Print:   PARTNAME_COLOR_QTY_MATERIAL   (MATERIAL omitted ⇒ PETG)
 * Custom Cut: PARTNAME_QTY_MATERIAL
 * Falls back to {name: whole base, qty: 1} when it can't find a quantity token.
 */
export function parseFabricationFilename(
  filename: string,
  category: Exclude<BomLineCategory, "order">,
): ParsedFabricationName {
  const base = stripExt(filename).trim();
  const tokens = base.split("_").map((t) => t.trim()).filter(Boolean);
  const qtyIdx = lastIntIndex(tokens);

  if (category === "3d_print") {
    if (qtyIdx >= 2) {
      const material = tokens.slice(qtyIdx + 1).join(" ") || null;
      return {
        name: tokens.slice(0, qtyIdx - 1).join("_") || base,
        color: tokens[qtyIdx - 1] || null,
        material: material ?? "PETG",
        qty: Math.max(1, Number.parseInt(tokens[qtyIdx], 10) || 1),
      };
    }
    return { name: base, color: null, material: "PETG", qty: 1 };
  }

  // custom_cut
  if (qtyIdx >= 1) {
    return {
      name: tokens.slice(0, qtyIdx).join("_") || base,
      color: null,
      material: tokens.slice(qtyIdx + 1).join(" ") || null,
      qty: Math.max(1, Number.parseInt(tokens[qtyIdx], 10) || 1),
    };
  }
  return { name: base, color: null, material: null, qty: 1 };
}
