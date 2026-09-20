/**
 * A part still physically checked out of general inventory. Deleting a Build
 * project or subsystem while any of these are outstanding would drop the only
 * record of where those units went, so both deletes refuse until the list is
 * empty — the parts have to come back first (Disassemble, or a "Put back"
 * button on the project board).
 *
 * Kept apart from `holds.ts` so Client Components can name the type without
 * pulling a server-only module into the browser bundle.
 */
export type PartHold = { partId: string | null; name: string; qty: number };
