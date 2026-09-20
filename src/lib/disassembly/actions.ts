"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { manuallyReturnPartAction } from "@/lib/parts/actions";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Staff-only. Opens a disassembly session for a retired project, snapshotting
 * its current collected state as the expected-return list — one line per
 * subsystem's collected BOM line (so the same part collected into two
 * subsystems gets two lines), plus one line per "orphan" allocation with no
 * BOM line behind it (a fabricated-catalog part allocated straight from
 * inventory, or leftovers from an older return — same case the project page
 * flags). Resumes the existing open session for that project instead of
 * starting a second one.
 */
export async function startDisassemblySessionAction(projectId: string): Promise<{ id?: string; error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("disassembly_sessions")
    .select("id")
    .eq("project_id", projectId)
    .is("completed_at", null)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const { data: subsystems } = await admin.from("subsystems").select("id").eq("project_id", projectId);
  const subsystemIds = (subsystems ?? []).map((s) => s.id);

  let cotsLines: { id: string; subsystem_id: string | null; matched_part_id: string | null; qty_scanned: number }[] =
    [];
  if (subsystemIds.length > 0) {
    const { data } = await admin
      .from("bom_lines")
      .select("id, subsystem_id, matched_part_id, qty_scanned")
      .in("subsystem_id", subsystemIds)
      .eq("category", "order")
      .gt("qty_scanned", 0);
    cotsLines = (data ?? []).filter((l) => l.matched_part_id);
  }

  const { data: allocations } = await admin
    .from("part_allocations")
    .select("part_id, qty")
    .eq("project_id", projectId)
    .gt("qty", 0);

  const scannedByPart = new Map<string, number>();
  for (const l of cotsLines) {
    scannedByPart.set(l.matched_part_id!, (scannedByPart.get(l.matched_part_id!) ?? 0) + l.qty_scanned);
  }
  const orphanRows = (allocations ?? [])
    .map((a) => ({ part_id: a.part_id, qty: a.qty - (scannedByPart.get(a.part_id) ?? 0) }))
    .filter((o) => o.qty > 0);

  if (cotsLines.length === 0 && orphanRows.length === 0) {
    return { error: "This project has no parts collected or allocated — nothing to disassemble." };
  }

  const { data: session, error } = await admin
    .from("disassembly_sessions")
    .insert({ project_id: projectId, started_by: profile!.id })
    .select("id")
    .single();
  if (error || !session) return { error: error?.message ?? "Couldn't start the session." };

  const rows = [
    ...cotsLines.map((l) => ({
      session_id: session.id,
      part_id: l.matched_part_id!,
      subsystem_id: l.subsystem_id,
      bom_line_id: l.id,
      expected_qty: l.qty_scanned,
    })),
    ...orphanRows.map((o) => ({
      session_id: session.id,
      part_id: o.part_id,
      subsystem_id: null,
      bom_line_id: null,
      expected_qty: o.qty,
    })),
  ];
  await admin.from("disassembly_session_lines").insert(rows);

  revalidatePath(`/team/build/disassemble/${projectId}`);
  return { id: session.id };
}

export type DisassemblyLineProgress = {
  /** disassembly_session_lines row id — what the return/mark-lost actions key off. */
  id: string;
  partId: string;
  partName: string;
  partImageUrl: string | null;
  /** Where to put it back — the part's storage location, same field the collect flow shows as the pickup spot. */
  location: string | null;
  subsystemId: string | null;
  /** Null for an orphan line (no subsystem behind it — general stock). */
  subsystemName: string | null;
  bomLineId: string | null;
  expectedQty: number;
  /** Written off via "Mark lost" — separate from remainingQty. */
  lostQty: number;
  /** Still outstanding: neither returned nor marked lost yet. */
  remainingQty: number;
  /** 3D-print/custom-cut parts are discarded on completion instead of scanned back — see completeDisassemblySessionAction. */
  isFabricated: boolean;
};

/**
 * Live view of a session's snapshot: for a BOM-line-backed row, "remaining"
 * is that specific line's current qty_scanned (return/mark-lost decrement it
 * directly); for an orphan row, it's the part's current allocation to the
 * project.
 */
export async function getDisassemblyProgress(sessionId: string, projectId: string): Promise<DisassemblyLineProgress[]> {
  const admin = createAdminClient();
  const { data: lines } = await admin
    .from("disassembly_session_lines")
    .select("id, part_id, subsystem_id, bom_line_id, expected_qty, lost_qty")
    .eq("session_id", sessionId);

  const partIds = [...new Set((lines ?? []).map((l) => l.part_id))];
  const bomLineIds = [...new Set((lines ?? []).map((l) => l.bom_line_id).filter((id): id is string => Boolean(id)))];
  const subsystemIds = [
    ...new Set((lines ?? []).map((l) => l.subsystem_id).filter((id): id is string => Boolean(id))),
  ];

  const [{ data: parts }, { data: bomLines }, { data: subsystems }, { data: allocations }] = await Promise.all([
    partIds.length > 0
      ? admin.from("parts").select("id, name, image_url, location, manufacturing_method").in("id", partIds)
      : Promise.resolve({ data: [] }),
    bomLineIds.length > 0
      ? admin.from("bom_lines").select("id, qty_scanned").in("id", bomLineIds)
      : Promise.resolve({ data: [] }),
    subsystemIds.length > 0
      ? admin.from("subsystems").select("id, name").in("id", subsystemIds)
      : Promise.resolve({ data: [] }),
    admin.from("part_allocations").select("part_id, qty").eq("project_id", projectId),
  ]);

  const partById = new Map((parts ?? []).map((p) => [p.id, p]));
  const bomLineById = new Map((bomLines ?? []).map((b) => [b.id, b]));
  const subsystemNameById = new Map((subsystems ?? []).map((s) => [s.id, s.name]));
  const allocByPart = new Map((allocations ?? []).map((a) => [a.part_id, a.qty]));

  return (lines ?? []).map((l) => {
    const part = partById.get(l.part_id);
    const remaining = l.bom_line_id
      ? (bomLineById.get(l.bom_line_id)?.qty_scanned ?? 0)
      : Math.max(0, allocByPart.get(l.part_id) ?? 0);
    return {
      id: l.id,
      partId: l.part_id,
      partName: part?.name ?? "Unknown part",
      partImageUrl: part?.image_url ?? null,
      location: part?.location ?? null,
      subsystemId: l.subsystem_id,
      subsystemName: l.subsystem_id ? (subsystemNameById.get(l.subsystem_id) ?? "Unknown subsystem") : null,
      bomLineId: l.bom_line_id,
      expectedQty: l.expected_qty,
      lostQty: l.lost_qty,
      remainingQty: remaining,
      isFabricated: part?.manufacturing_method === "3d_print" || part?.manufacturing_method === "custom_cut",
    };
  });
}

/**
 * Staff-only. Returns a specific subsystem's collected line straight to
 * inventory — the disassembly checklist's per-line "Mark returned", scoped
 * to exactly the line the member is looking at rather than guessing which of
 * a part's several collected lines to decrement (manuallyReturnPartAction's
 * cross-line "sync" mode, used everywhere else a return isn't tied to one
 * specific line).
 */
export async function returnDisassemblyLineAction(bomLineId: string, qty: number): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const amount = Math.max(0, Math.round(qty));
  if (amount <= 0) return {};

  const admin: AdminClient = createAdminClient();
  const { data: line } = await admin
    .from("bom_lines")
    .select("matched_part_id, qty_scanned, qty_needed, subsystem_id")
    .eq("id", bomLineId)
    .maybeSingle();
  if (!line || !line.matched_part_id || !line.subsystem_id) return { error: "That line no longer exists." };
  if (amount > line.qty_scanned) return { error: "That's more than is still outstanding on this line." };

  const { data: subsystem } = await admin
    .from("subsystems")
    .select("project_id")
    .eq("id", line.subsystem_id)
    .maybeSingle();
  if (!subsystem) return { error: "That subsystem no longer exists." };

  const result = await manuallyReturnPartAction(subsystem.project_id, line.matched_part_id, amount, {
    syncBomLines: false,
  });
  if (result.error) return result;

  const newScanned = line.qty_scanned - amount;
  if (newScanned === 0 && line.qty_needed === 0) {
    await admin.from("bom_lines").delete().eq("id", bomLineId);
  } else {
    await admin.from("bom_lines").update({ qty_scanned: newScanned }).eq("id", bomLineId);
  }

  revalidatePath(`/team/build/disassemble/${subsystem.project_id}`);
  revalidatePath(`/team/build/subsystem/${line.subsystem_id}`);
  revalidatePath(`/team/build/project/${subsystem.project_id}`);
  return {};
}

/**
 * Staff-only. Writes off units as lost instead of returned — for whatever's
 * still outstanding on a session line (a specific subsystem's collected BOM
 * line, or an orphan allocation) that isn't coming back. Unlike a return,
 * stock never goes up; the units just come off the project's books for good,
 * with the loss logged on the session line and as a scan_events entry.
 */
export async function markDisassemblyLineLostAction(sessionLineId: string, qty: number): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const amount = Math.max(0, Math.round(qty));
  if (amount <= 0) return {};

  const admin = createAdminClient();
  const { data: sessionLine } = await admin
    .from("disassembly_session_lines")
    .select("id, session_id, part_id, subsystem_id, bom_line_id, lost_qty")
    .eq("id", sessionLineId)
    .maybeSingle();
  if (!sessionLine) return { error: "That line no longer exists." };

  const { data: session } = await admin
    .from("disassembly_sessions")
    .select("project_id, completed_at")
    .eq("id", sessionLine.session_id)
    .maybeSingle();
  if (!session) return { error: "That session no longer exists." };
  if (session.completed_at) return { error: "This session is already closed." };

  const { data: alloc } = await admin
    .from("part_allocations")
    .select("qty")
    .eq("part_id", sessionLine.part_id)
    .eq("project_id", session.project_id)
    .maybeSingle();
  const currentAlloc = alloc?.qty ?? 0;

  if (sessionLine.bom_line_id) {
    const { data: line } = await admin
      .from("bom_lines")
      .select("qty_scanned, qty_needed")
      .eq("id", sessionLine.bom_line_id)
      .maybeSingle();
    if (!line) return { error: "That BOM line no longer exists." };
    if (amount > line.qty_scanned) return { error: "That's more than is still outstanding on this line." };

    const newScanned = line.qty_scanned - amount;
    if (newScanned === 0 && line.qty_needed === 0) {
      await admin.from("bom_lines").delete().eq("id", sessionLine.bom_line_id);
    } else {
      await admin.from("bom_lines").update({ qty_scanned: newScanned }).eq("id", sessionLine.bom_line_id);
    }
  } else if (amount > currentAlloc) {
    return { error: "That's more than is still outstanding." };
  }

  await admin
    .from("part_allocations")
    .update({ qty: Math.max(0, currentAlloc - amount) })
    .eq("part_id", sessionLine.part_id)
    .eq("project_id", session.project_id);

  await admin.from("scan_events").insert({
    part_id: sessionLine.part_id,
    project_id: session.project_id,
    user_id: profile!.id,
    action: "lost",
    qty: amount,
  });
  await admin
    .from("disassembly_session_lines")
    .update({ lost_qty: sessionLine.lost_qty + amount })
    .eq("id", sessionLineId);

  revalidatePath(`/team/build/disassemble/${session.project_id}`);
  if (sessionLine.subsystem_id) revalidatePath(`/team/build/subsystem/${sessionLine.subsystem_id}`);
  revalidatePath(`/team/build/project/${session.project_id}`);
  return {};
}

/**
 * Staff-only. Closes the session — safe to call even with COTS parts still
 * outstanding (the discrepancy just gets logged on the session as a note,
 * per Krish's spec: "let staff either keep looking or close it out with the
 * shortfall logged"). Any 3D-print/custom-cut part still allocated to this
 * project at close-out is discarded for good — fabricated parts never go
 * back to general stock, so there's nothing to "scan back" for them.
 */
export async function completeDisassemblySessionAction(
  sessionId: string,
  projectId: string,
  discrepancyNote: string | null,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const admin = createAdminClient();

  const [{ data: lines }, { data: allocations }] = await Promise.all([
    admin.from("disassembly_session_lines").select("part_id").eq("session_id", sessionId),
    admin.from("part_allocations").select("part_id, qty").eq("project_id", projectId).gt("qty", 0),
  ]);
  const remainingByPart = new Map((allocations ?? []).map((a) => [a.part_id, a.qty]));
  const sessionPartIds = [...new Set((lines ?? []).map((l) => l.part_id))];

  if (sessionPartIds.length > 0) {
    const { data: parts } = await admin.from("parts").select("id, manufacturing_method").in("id", sessionPartIds);
    for (const part of parts ?? []) {
      const isFabricated = part.manufacturing_method === "3d_print" || part.manufacturing_method === "custom_cut";
      if (!isFabricated || (remainingByPart.get(part.id) ?? 0) <= 0) continue;
      await admin.from("part_allocations").delete().eq("part_id", part.id).eq("project_id", projectId);
      // scan_events references parts without ON DELETE CASCADE — clear its history first, same as deletePartAction.
      await admin.from("scan_events").delete().eq("part_id", part.id);
      await admin.from("parts").delete().eq("id", part.id);
    }
  }

  const { error } = await admin
    .from("disassembly_sessions")
    .update({ completed_at: new Date().toISOString(), discrepancy_note: discrepancyNote })
    .eq("id", sessionId);
  if (error) return { error: error.message };

  revalidatePath(`/team/build/disassemble/${projectId}`);
  revalidatePath("/team/build");
  return {};
}
