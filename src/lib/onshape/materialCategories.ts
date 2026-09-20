export type BomCategory = "3d_print" | "custom_cut" | "order";

export const BOM_CATEGORY_LABEL: Record<BomCategory, string> = {
  "3d_print": "3D Print",
  custom_cut: "Custom Cut",
  order: "COTS Parts",
};

/**
 * Material name (lowercase, matched by substring) → category. Not
 * hardcoded into the categorizer itself since the printer/stock material
 * list changes season to season — just edit this table.
 */
const MATERIAL_CATEGORY_MAP: { match: string; category: BomCategory }[] = [
  { match: "petg", category: "3d_print" },
  { match: "abs", category: "3d_print" },
  { match: "pla", category: "3d_print" },
  { match: "nylon", category: "3d_print" },
  { match: "tpu", category: "3d_print" },
  { match: "delrin", category: "custom_cut" },
  { match: "acetal", category: "custom_cut" },
  { match: "polycarbonate", category: "custom_cut" },
  { match: "polypropylene", category: "custom_cut" },
  { match: "aluminum", category: "custom_cut" },
  { match: "aluminium", category: "custom_cut" },
  { match: "steel", category: "custom_cut" },
  { match: "wood", category: "custom_cut" },
  { match: "plywood", category: "custom_cut" },
  { match: "acrylic", category: "custom_cut" },
  { match: "polycarb", category: "custom_cut" },
];

/**
 * Anything with no material, or a material that doesn't match the table
 * above, is treated as off-the-shelf/purchased — safest default for an
 * unrecognized value.
 *
 * `hasLinkedMatch` says whether an existing part on file (matched by part
 * number/name) already has a purchase link — if so, a would-be custom_cut
 * material is downgraded to "order" since it can just be reordered instead
 * of fabricated in-house.
 */
export function categorizeMaterial(material: string | null | undefined, hasLinkedMatch: boolean): BomCategory {
  if (!material) return "order";
  const lower = material.trim().toLowerCase();
  if (!lower) return "order";
  const hit = MATERIAL_CATEGORY_MAP.find((m) => lower.includes(m.match));
  if (!hit) return "order";
  if (hit.category === "custom_cut" && hasLinkedMatch) return "order";
  return hit.category;
}
