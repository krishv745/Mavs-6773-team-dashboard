"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { getSubsystemPartHolds, type PartHold } from "@/lib/build/holds";

/** Staff-only. Creates a subsystem under a Build project. */
export async function createSubsystemAction(
  projectId: string,
  name: string,
): Promise<{ id?: string; name?: string; error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const trimmed = name.trim();
  if (!projectId) return { error: "Missing project." };
  if (!trimmed) return { error: "Subsystem name is required." };

  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (!project) return { error: "That project no longer exists." };

  const { data, error } = await admin
    .from("subsystems")
    .insert({ project_id: projectId, name: trimmed })
    .select("id, name")
    .single();
  if (error || !data) return { error: "That subsystem may already exist." };

  revalidatePath(`/team/build/project/${projectId}`);
  return { id: data.id, name: data.name };
}

/** Staff-only. Renames a subsystem. */
export async function renameSubsystemAction(
  subsystemId: string,
  name: string,
): Promise<{ name?: string; error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const trimmed = name.trim();
  if (!subsystemId) return { error: "Missing subsystem." };
  if (!trimmed) return { error: "Subsystem name is required." };

  const admin = createAdminClient();
  const { data: subsystem } = await admin
    .from("subsystems")
    .select("project_id")
    .eq("id", subsystemId)
    .maybeSingle();
  if (!subsystem) return { error: "That subsystem no longer exists." };

  const { data, error } = await admin
    .from("subsystems")
    .update({ name: trimmed })
    .eq("id", subsystemId)
    .select("id, name")
    .maybeSingle();
  if (error || !data) return { error: "A subsystem with that name may already exist here." };

  revalidatePath(`/team/build/subsystem/${subsystemId}`);
  revalidatePath(`/team/build/project/${subsystem.project_id}`);
  return { name: data.name };
}

/**
 * Staff-only. Deletes a subsystem and everything under it (imports, lines,
 * files cascade).
 *
 * Refuses while the subsystem still has COTS parts collected against it —
 * those units are checked out of general inventory, and cascading the BOM
 * lines away would leave the project holding stock nothing accounts for.
 * 3D-print/custom-cut lines (checklist-only, never hold inventory) and lines
 * not yet collected don't count. The outstanding list comes back in `holds`
 * so the caller can say which parts.
 */
export async function deleteSubsystemAction(
  subsystemId: string,
): Promise<{ projectId?: string; error?: string; holds?: PartHold[] }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "manage_parts")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: subsystem } = await admin
    .from("subsystems")
    .select("project_id")
    .eq("id", subsystemId)
    .maybeSingle();
  if (!subsystem) return {};

  // Re-checked here, not just in the UI — the button is only a shortcut to
  // this action.
  const holds = await getSubsystemPartHolds(admin, subsystemId);
  if (holds.length > 0) {
    return { holds, error: "Return this subsystem's collected parts to inventory first." };
  }

  const { error } = await admin.from("subsystems").delete().eq("id", subsystemId);
  if (error) return { error: error.message };

  revalidatePath(`/team/build/project/${subsystem.project_id}`);
  revalidatePath("/team/build");
  return { projectId: subsystem.project_id };
}
