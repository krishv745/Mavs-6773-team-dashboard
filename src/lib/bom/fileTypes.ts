import type { BomLineCategory } from "@/lib/supabase/types";

export const PRINT_FILE_EXTENSIONS = [".stl", ".3mf", ".step", ".zip"];
export const CUT_FILE_EXTENSIONS = [".dxf", ".step"];

/** COTS lines never carry file attachments — only 3D Print / Custom Cut lines do. */
export function allowedBomFileExtensions(category: BomLineCategory): string[] | null {
  if (category === "3d_print") return PRINT_FILE_EXTENSIONS;
  if (category === "custom_cut") return CUT_FILE_EXTENSIONS;
  return null;
}
