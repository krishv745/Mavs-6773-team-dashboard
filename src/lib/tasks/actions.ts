"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { formatCalendarDate } from "@/lib/formatTime";
import { deadlineError } from "@/lib/deadlines";
import { nextProjectColor, isValidProjectColor } from "@/lib/projectColors";
import { isSubteam, isStageKind, stageLabel } from "@/lib/subteams";
import type { ActionState } from "@/lib/auth/actions";
import type { Subteam, TaskPriority, TaskStageKind } from "@/lib/supabase/types";

type AdminClient = ReturnType<typeof createAdminClient>;

function formatDate(iso: string) {
  return formatCalendarDate(iso, { month: "short", day: "numeric", year: "numeric" });
}

/** Both Projects surfaces render from the same tables — refresh them together. */
function revalidateBoard() {
  revalidatePath("/team/projects");
  revalidatePath("/team/projects/my-tasks");
}

/**
 * If a task's deadline lands after its project's current deadline (or the
 * project has none yet), pull the project's deadline along with it and log
 * the change — a project can never wrap up before its latest task is due.
 */
async function extendProjectDeadlineIfNeeded(
  admin: AdminClient,
  projectId: string,
  taskDeadline: string,
  taskTitle: string,
  changedBy: string,
) {
  const { data: project } = await admin
    .from("task_projects")
    .select("deadline, ongoing")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || project.ongoing) return;
  if (project.deadline && project.deadline >= taskDeadline) return;

  await admin.from("task_projects").update({ deadline: taskDeadline }).eq("id", projectId);
  await admin.from("task_project_deadline_log").insert({
    project_id: projectId,
    old_deadline: project.deadline,
    new_deadline: taskDeadline,
    changed_by: changedBy,
    reason: `Auto-extended — "${taskTitle}" was set due ${formatDate(taskDeadline)}`,
  });
}

export async function createProjectAction(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };
  if (!hasPermission(profile, "create_tasks")) return { error: "Only Senior Team Leads and the Owner can add tasks and projects." };

  const name = String(formData.get("name") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "") || null;
  if (!name) return { error: "Project name is required." };
  if (deadline && deadlineError(deadline)) return { error: deadlineError(deadline)! };

  const admin = createAdminClient();
  const { count } = await admin.from("task_projects").select("id", { count: "exact", head: true });
  const color = nextProjectColor(count ?? 0);

  const { error } = await admin
    .from("task_projects")
    .insert({ name, deadline, color, created_by: profile.id });
  if (error) return { error: "Could not create project. Try again." };

  revalidateBoard();
  return { ok: true };
}

/** Requires edit_projects. Manual color change — projects get a default palette color on creation, this just lets someone re-pick if two colors feel too similar. */
export async function updateProjectColorAction(projectId: string, color: string) {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_projects")) throw new Error("Not authorized.");
  if (!isValidProjectColor(color)) throw new Error("Not a valid project color.");

  const admin = createAdminClient();
  await admin.from("task_projects").update({ color }).eq("id", projectId);

  revalidateBoard();
}

/** Requires edit_projects. Sets a project's priority — the dashboard sorts highest first. */
export async function updateProjectPriorityAction(
  projectId: string,
  priority: TaskPriority,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_projects")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { error } = await admin.from("task_projects").update({ priority }).eq("id", projectId);
  if (error) return { error: error.message };

  revalidateBoard();
  return {};
}

/** Requires edit_projects. Marks a project complete — reversible via reopenProjectAction, doesn't touch its tasks. */
export async function completeProjectAction(projectId: string) {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_projects")) throw new Error("Not authorized.");

  const admin = createAdminClient();
  await admin.from("task_projects").update({ completed_at: new Date().toISOString() }).eq("id", projectId);

  revalidateBoard();
}

/** Requires edit_projects. Reopens a completed project. */
export async function reopenProjectAction(projectId: string) {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_projects")) throw new Error("Not authorized.");

  const admin = createAdminClient();
  await admin.from("task_projects").update({ completed_at: null }).eq("id", projectId);

  revalidateBoard();
}

/**
 * Requires delete_projects. Deletes the project and its tasks (and the
 * deadline-change log), but keeps every work log: each log's task_id goes
 * null and its task_title snapshots the name, so the entries stay readable
 * in the Logs tab. Requires typing the project's name to confirm.
 */
export async function deleteProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "delete_projects")) return { error: "Not authorized." };

  const projectId = String(formData.get("projectId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "").trim();
  if (!projectId) return { error: "Missing project." };

  const admin = createAdminClient();
  const { data: project } = await admin.from("task_projects").select("name").eq("id", projectId).maybeSingle();
  if (!project) return { error: "Project not found." };
  if (confirmName !== project.name) return { error: "Type the project name exactly to confirm." };

  // Snapshot each task's name onto its logs before the cascade nulls task_id.
  const { data: projectTasks } = await admin.from("tasks").select("id, title").eq("project_id", projectId);
  for (const t of projectTasks ?? []) {
    await admin.from("task_logs").update({ task_title: t.title }).eq("task_id", t.id);
  }

  await admin.from("task_projects").delete().eq("id", projectId);

  revalidateBoard();
  redirect("/team/projects");
}

export async function createTaskAction(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };
  if (!hasPermission(profile, "create_tasks")) return { error: "Only Senior Team Leads and the Owner can add tasks and projects." };

  const projectId = String(formData.get("projectId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const subteam = String(formData.get("subteam") ?? "") as Subteam;
  const description = String(formData.get("description") ?? "").trim() || null;
  const ongoing = formData.get("ongoing") === "on" || formData.get("ongoing") === "true";
  const priorityRaw = String(formData.get("priority") ?? "medium");
  const priority: TaskPriority = priorityRaw === "high" || priorityRaw === "low" ? priorityRaw : "medium";
  const assigneeIds = formData.getAll("assigneeIds").map((v) => String(v)).filter(Boolean);

  if (!projectId || !title) return { error: "Task name is required." };
  if (!isSubteam(subteam)) {
    return { error: "Pick at least one subteam stage. Testing can't be the only stage." };
  }

  // The form only asks for stages: `subteam` is the main stage (the first
  // subteam picked) and `stageKinds` are the rest, each with its own deadline.
  const stageKinds = [
    ...new Set(formData.getAll("stageKinds").map((v) => String(v))),
  ].filter((k): k is TaskStageKind => isStageKind(k) && k !== subteam);
  const stages = [subteam as TaskStageKind, ...stageKinds].map((kind) => ({
    kind,
    deadline: ongoing ? null : String(formData.get(`stageDeadline_${kind}`) ?? "") || null,
  }));
  for (const st of stages) {
    if (st.deadline && deadlineError(st.deadline)) {
      return { error: `${stageLabel(st.kind)}: ${deadlineError(st.deadline)}` };
    }
  }

  // The task as a whole is due when its last stage is.
  const deadline =
    stages
      .map((st) => st.deadline)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? null;

  const admin = createAdminClient();
  const { data: task, error } = await admin
    .from("tasks")
    .insert({
      title,
      subteam,
      description,
      deadline,
      ongoing,
      priority,
      created_by: profile.id,
      project_id: projectId,
      // No approval step — a new task is live immediately.
      status: "active" as const,
      approved_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !task) return { error: "Could not create task. Try again." };

  if (assigneeIds.length > 0) {
    await admin.from("task_assignees").insert(assigneeIds.map((userId) => ({ task_id: task.id, user_id: userId })));
  }

  // Upsert so the main stage gets its own deadline instead of the DB
  // trigger's default (which copies the task's overall deadline).
  await admin.from("task_stages").upsert(
    stages.map((st) => ({ task_id: task.id, kind: st.kind, deadline: st.deadline, started_by: profile.id })),
    { onConflict: "task_id,kind" },
  );

  if (deadline) {
    await extendProjectDeadlineIfNeeded(admin, projectId, deadline, title, profile.id);
  }

  revalidateBoard();
  return { ok: true };
}

/** Requires edit_tasks: replace a task's full assignee set in one shot. */
export async function updateTaskAssigneesAction(
  taskId: string,
  userIds: string[],
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_tasks")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: task } = await admin.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
  if (!task) return { error: "Task not found." };

  await admin.from("task_assignees").delete().eq("task_id", taskId);
  if (userIds.length > 0) {
    const { error } = await admin
      .from("task_assignees")
      .insert(userIds.map((userId) => ({ task_id: taskId, user_id: userId })));
    if (error) return { error: error.message };
  }

  revalidateBoard();
  return {};
}

export async function archiveTaskAction(taskId: string) {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_tasks")) throw new Error("Not authorized.");

  const admin = createAdminClient();
  await admin.from("tasks").update({ status: "archived" }).eq("id", taskId);
  revalidateBoard();
}

/**
 * Requires delete_tasks. Removes the task and its assignees, but keeps its
 * work logs: each log's task_id goes null and its task_title snapshots the
 * name, so the entry stays readable in the Logs tab.
 */
export async function deleteTaskAction(taskId: string) {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "delete_tasks")) throw new Error("Not authorized.");

  const admin = createAdminClient();
  const { data: task } = await admin.from("tasks").select("title, project_id").eq("id", taskId).maybeSingle();

  if (task) {
    await admin.from("task_logs").update({ task_title: task.title }).eq("task_id", taskId);
  }
  await admin.from("tasks").delete().eq("id", taskId);

  revalidateBoard();
  redirect("/team/projects");
}

export async function unarchiveTaskAction(taskId: string) {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_tasks")) throw new Error("Not authorized.");

  const admin = createAdminClient();
  await admin.from("tasks").update({ status: "active" }).eq("id", taskId);
  revalidateBoard();
}

export async function completeTaskAction(taskId: string) {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_tasks")) throw new Error("Not authorized.");

  const admin = createAdminClient();
  await admin.from("tasks").update({ status: "completed" }).eq("id", taskId);
  revalidateBoard();
}

/** Reopens a completed task back to active — does not affect archived tasks. */
export async function reopenTaskAction(taskId: string) {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_tasks")) throw new Error("Not authorized.");

  const admin = createAdminClient();
  await admin.from("tasks").update({ status: "active" }).eq("id", taskId);
  revalidateBoard();
}

/**
 * Requires edit_tasks. Single-field inline edits from the Projects dashboard —
 * one of title / subteam / description / deadline at a time. For "deadline",
 * `value` is a date, "" / null (no due date), or "ongoing". A real deadline
 * change is still logged and still pulls the project's deadline forward.
 */
export async function updateTaskFieldAction(
  taskId: string,
  field: "title" | "subteam" | "description" | "deadline",
  value: string | null,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_tasks")) return { error: "Not authorized." };
  if (!taskId) return { error: "Missing task." };

  const admin = createAdminClient();
  const { data: task } = await admin.from("tasks").select("deadline, title, project_id").eq("id", taskId).single();
  if (!task) return { error: "Task not found." };

  if (field === "title") {
    const title = (value ?? "").trim();
    if (!title) return { error: "Task name is required." };
    await admin.from("tasks").update({ title }).eq("id", taskId);
  } else if (field === "subteam") {
    if (!isSubteam(value)) return { error: "Not a valid subteam." };
    await admin.from("tasks").update({ subteam: value }).eq("id", taskId);
  } else if (field === "description") {
    await admin.from("tasks").update({ description: (value ?? "").trim() || null }).eq("id", taskId);
  } else if (value === "ongoing") {
    await admin.from("tasks").update({ deadline: null, ongoing: true }).eq("id", taskId);
  } else {
    const newDeadline = value || null;
    if (newDeadline && deadlineError(newDeadline)) return { error: deadlineError(newDeadline)! };
    await admin.from("tasks").update({ deadline: newDeadline, ongoing: false }).eq("id", taskId);
    const note =
      !task.deadline && newDeadline
        ? `📅 Deadline set to ${formatDate(newDeadline)}`
        : task.deadline && !newDeadline
          ? "📅 Deadline removed"
          : task.deadline && newDeadline && task.deadline !== newDeadline
            ? `📅 Deadline changed from ${formatDate(task.deadline)} to ${formatDate(newDeadline)}`
            : null;
    if (note) {
      await admin.from("task_logs").insert({ task_id: taskId, user_id: profile!.id, description: note });
    }
    if (newDeadline && task.project_id) {
      await extendProjectDeadlineIfNeeded(admin, task.project_id, newDeadline, task.title, profile!.id);
    }
  }

  revalidateBoard();
  return {};
}

/**
 * Moves a task to a different project — the Projects board's "Move tasks"
 * drag mode. Logs the move so it shows up in the task's own Activity Log,
 * same as a deadline change.
 */
export async function moveTaskToProjectAction(
  taskId: string,
  toProjectId: string,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_tasks")) return { error: "Not authorized." };
  if (!taskId || !toProjectId) return { error: "Missing task or project." };

  const admin = createAdminClient();
  const { data: task } = await admin
    .from("tasks")
    .select("title, project_id, deadline")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { error: "That task no longer exists." };
  if (task.project_id === toProjectId) return {};

  const { data: toProject } = await admin
    .from("task_projects")
    .select("name")
    .eq("id", toProjectId)
    .maybeSingle();
  if (!toProject) return { error: "That project no longer exists." };

  const { error } = await admin.from("tasks").update({ project_id: toProjectId }).eq("id", taskId);
  if (error) return { error: error.message };

  await admin
    .from("task_logs")
    .insert({ task_id: taskId, user_id: profile!.id, description: `📁 Moved to ${toProject.name}` });

  // Same rule as changing the task's own deadline: its new project can't
  // wrap up before it's due either.
  if (task.deadline) {
    await extendProjectDeadlineIfNeeded(admin, toProjectId, task.deadline, task.title, profile!.id);
  }

  revalidateBoard();
  return {};
}

/** Requires edit_projects. The project's description shown when a project row is expanded. */
export async function updateTaskProjectDescriptionAction(
  projectId: string,
  description: string,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_projects")) return { error: "Not authorized." };
  if (!projectId) return { error: "Missing project." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("task_projects")
    .update({ description: description.trim() || null })
    .eq("id", projectId);
  if (error) return { error: error.message };

  revalidateBoard();
  return {};
}

/**
 * Requires edit_projects. Copies a project and its tasks into a fresh
 * "{name} (copy)" — carries over title, subteam, priority, deadline,
 * description and ongoing; drops assignees and work logs. Completed tasks
 * come over as active.
 */
export async function duplicateProjectAction(projectId: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_projects")) return { error: "Not authorized." };
  if (!projectId) return { error: "Missing project." };

  const admin = createAdminClient();
  const { data: source } = await admin
    .from("task_projects")
    .select("name, color, priority, deadline, description, ongoing")
    .eq("id", projectId)
    .maybeSingle();
  if (!source) return { error: "Project not found." };

  const { data: copy, error } = await admin
    .from("task_projects")
    .insert({
      name: `${source.name} (copy)`,
      color: source.color,
      priority: source.priority,
      deadline: source.deadline,
      description: source.description,
      ongoing: source.ongoing,
      created_by: profile!.id,
    })
    .select("id")
    .single();
  if (error || !copy) return { error: "Couldn't duplicate that project." };

  const { data: tasks } = await admin
    .from("tasks")
    .select("title, subteam, priority, deadline, description, ongoing")
    .eq("project_id", projectId)
    .in("status", ["active", "completed"]);
  if (tasks && tasks.length > 0) {
    await admin.from("tasks").insert(
      tasks.map((t) => ({
        title: t.title,
        subteam: t.subteam,
        priority: t.priority,
        deadline: t.deadline,
        description: t.description,
        ongoing: t.ongoing,
        project_id: copy.id,
        created_by: profile!.id,
        status: "active" as const,
        approved_by: profile!.id,
      })),
    );
  }

  revalidateBoard();
  return {};
}

/** Requires edit_projects. Inline rename from the dashboard (updateProjectNameAction is the form-based version the detail page uses). */
export async function renameTaskProjectAction(projectId: string, name: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_projects")) return { error: "Not authorized." };
  const trimmed = name.trim();
  if (!projectId) return { error: "Missing project." };
  if (!trimmed) return { error: "Project name is required." };

  const admin = createAdminClient();
  const { error } = await admin.from("task_projects").update({ name: trimmed }).eq("id", projectId);
  if (error) return { error: error.message };

  revalidateBoard();
  return {};
}

/** Requires edit_projects. Inline deadline set from the dashboard — a date, "" / null, or "ongoing". Real date changes are logged. */
export async function setTaskProjectDeadlineAction(
  projectId: string,
  deadline: string | null,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_projects")) return { error: "Not authorized." };
  if (!projectId) return { error: "Missing project." };

  const admin = createAdminClient();
  const { data: project } = await admin.from("task_projects").select("deadline").eq("id", projectId).maybeSingle();
  if (!project) return { error: "Project not found." };

  if (deadline === "ongoing") {
    await admin.from("task_projects").update({ deadline: null, ongoing: true }).eq("id", projectId);
    revalidateBoard();
    return {};
  }

  const next = deadline || null;
  if (next && deadlineError(next)) return { error: deadlineError(next)! };
  await admin.from("task_projects").update({ deadline: next, ongoing: false }).eq("id", projectId);
  await admin.from("task_project_deadline_log").insert({
    project_id: projectId,
    old_deadline: project.deadline,
    new_deadline: next,
    changed_by: profile!.id,
    reason: null,
  });

  revalidateBoard();
  return {};
}

/** Requires edit_tasks. Sets a task's priority — used by the Projects board's inline priority select. */
export async function updateTaskPriorityAction(
  taskId: string,
  priority: TaskPriority,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_tasks")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: task } = await admin.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
  if (!task) return { error: "Task not found." };

  const { error } = await admin.from("tasks").update({ priority }).eq("id", taskId);
  if (error) return { error: error.message };

  revalidateBoard();
  return {};
}

/**
 * Log entry added straight from the Projects dashboard's inline composer (or
 * the chat assistant) — description + any number of photos, stays put and
 * returns instead of redirecting.
 */
export async function addTaskLogFromDashboardAction(
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };
  if (!hasPermission(profile, "add_logs")) return { error: "Your role can't add work logs." };

  const taskId = String(formData.get("taskId") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;
  // Photos/videos upload straight from the browser to Supabase Storage (see
  // NoteFields) — this just receives the resulting public URLs as plain
  // text, never the file bodies themselves.
  const photoUrls = formData.getAll("photo").map((v) => String(v)).filter(Boolean);
  if (!taskId) return { error: "Missing task." };
  if (!description && photoUrls.length === 0) return { error: "Add a note or a photo first." };

  const admin = createAdminClient();
  const { data: task } = await admin.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
  if (!task) return { error: "That task no longer exists." };

  const { error } = await admin.from("task_logs").insert({
    task_id: taskId,
    user_id: profile.id,
    description,
    photo_url: photoUrls[0] ?? null,
    photo_urls: photoUrls,
  });
  if (error) return { error: error.message };

  revalidateBoard();
  return { ok: true };
}

/**
 * Requires edit_tasks. Starts a follow-on stage on a task (e.g. a CAD task
 * moving on to Mechanical or Testing) with its own optional deadline. Logged
 * in the task's activity log, and a stage deadline pulls the project's
 * deadline forward just like the task's own deadline does.
 */
export async function startTaskStageAction(
  taskId: string,
  kind: TaskStageKind,
  deadline: string | null,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_tasks")) return { error: "Not authorized." };
  if (!taskId) return { error: "Missing task." };
  if (!isStageKind(kind)) return { error: "Not a valid stage." };
  const due = deadline || null;
  if (due && deadlineError(due)) return { error: deadlineError(due)! };

  const admin = createAdminClient();
  const { data: task } = await admin.from("tasks").select("title, subteam, project_id").eq("id", taskId).maybeSingle();
  if (!task) return { error: "That task no longer exists." };

  const { error } = await admin
    .from("task_stages")
    .insert({ task_id: taskId, kind, deadline: due, started_by: profile!.id });
  if (error) {
    return { error: error.code === "23505" ? `${stageLabel(kind)} is already started.` : error.message };
  }

  await admin.from("task_logs").insert({
    task_id: taskId,
    user_id: profile!.id,
    description: `▶️ Started ${stageLabel(kind)}${due ? ` — due ${formatDate(due)}` : ""}`,
  });
  if (due && task.project_id) {
    await extendProjectDeadlineIfNeeded(admin, task.project_id, due, `${task.title} (${stageLabel(kind)})`, profile!.id);
  }

  revalidateBoard();
  return {};
}

/** Requires edit_tasks. Changes (or clears) a stage's deadline. */
export async function updateTaskStageDeadlineAction(
  stageId: string,
  deadline: string | null,
): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_tasks")) return { error: "Not authorized." };
  const due = deadline && deadline !== "ongoing" ? deadline : null;
  if (due && deadlineError(due)) return { error: deadlineError(due)! };

  const admin = createAdminClient();
  const { data: stage } = await admin.from("task_stages").select("task_id, kind, deadline").eq("id", stageId).maybeSingle();
  if (!stage) return { error: "That stage no longer exists." };
  if (stage.deadline === due) return {};

  const { error } = await admin.from("task_stages").update({ deadline: due }).eq("id", stageId);
  if (error) return { error: error.message };

  const label = stageLabel(stage.kind);
  const note = due
    ? stage.deadline
      ? `📅 ${label} deadline changed from ${formatDate(stage.deadline)} to ${formatDate(due)}`
      : `📅 ${label} deadline set to ${formatDate(due)}`
    : `📅 ${label} deadline removed`;
  await admin.from("task_logs").insert({ task_id: stage.task_id, user_id: profile!.id, description: note });

  if (due) {
    const { data: task } = await admin.from("tasks").select("title, project_id").eq("id", stage.task_id).maybeSingle();
    if (task?.project_id) {
      await extendProjectDeadlineIfNeeded(admin, task.project_id, due, `${task.title} (${label})`, profile!.id);
    }
  }

  revalidateBoard();
  return {};
}

/** Requires edit_tasks. Marks a stage done, or reopens it. */
export async function setTaskStageCompleteAction(stageId: string, complete: boolean): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_tasks")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: stage } = await admin.from("task_stages").select("task_id, kind").eq("id", stageId).maybeSingle();
  if (!stage) return { error: "That stage no longer exists." };

  const { error } = await admin
    .from("task_stages")
    .update({ completed_at: complete ? new Date().toISOString() : null })
    .eq("id", stageId);
  if (error) return { error: error.message };

  await admin.from("task_logs").insert({
    task_id: stage.task_id,
    user_id: profile!.id,
    description: complete ? `✅ ${stageLabel(stage.kind)} done` : `↩️ ${stageLabel(stage.kind)} reopened`,
  });

  revalidateBoard();
  return {};
}

/** Requires edit_tasks. Removes a stage started by mistake. */
export async function removeTaskStageAction(stageId: string): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "edit_tasks")) return { error: "Not authorized." };

  const admin = createAdminClient();
  const { data: stage } = await admin.from("task_stages").select("task_id, kind").eq("id", stageId).maybeSingle();
  if (!stage) return {};
  const { data: owner } = await admin.from("tasks").select("subteam").eq("id", stage.task_id).maybeSingle();
  if (owner?.subteam === stage.kind) {
    return { error: "That's the task's main subteam. Change the task's subteam instead of removing it." };
  }

  const { error } = await admin.from("task_stages").delete().eq("id", stageId);
  if (error) return { error: error.message };

  await admin.from("task_logs").insert({
    task_id: stage.task_id,
    user_id: profile!.id,
    description: `🗑️ Removed ${stageLabel(stage.kind)} stage`,
  });

  revalidateBoard();
  return {};
}
