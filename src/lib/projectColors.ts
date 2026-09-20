// Small fixed palette so a project's color stays visually distinct from its
// neighbors and legible on a white card — assigned round-robin on creation
// (see createProjectAction), editable by staff afterward.
export const PROJECT_COLOR_PALETTE = [
  "#981C21", // crimson
  "#0E173F", // navy
  "#2563EB", // blue
  "#059669", // emerald
  "#D97706", // amber
  "#7C3AED", // violet
  "#DB2777", // pink
  "#0891B2", // cyan
] as const;

export const DEFAULT_PROJECT_COLOR = PROJECT_COLOR_PALETTE[0];

export function nextProjectColor(existingCount: number): string {
  return PROJECT_COLOR_PALETTE[existingCount % PROJECT_COLOR_PALETTE.length];
}

export function isValidProjectColor(color: string): color is (typeof PROJECT_COLOR_PALETTE)[number] {
  return (PROJECT_COLOR_PALETTE as readonly string[]).includes(color);
}
