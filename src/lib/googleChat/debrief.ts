import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Google Chat "/debrief" app (classic Chat API interaction events, not the
 * Workspace add-on format). The slash command is configured to open a dialog:
 *
 *   /debrief            → REQUEST_DIALOG  → project / task / update form
 *   change the project  → debrief_project → same form, task list for that project
 *   click "Post"        → debrief_submit  → task_logs row + a message posted to
 *                                            the whole space, dialog closes
 *
 * Who's posting comes only from Google's signed event (event.user.email),
 * matched against the dashboard account with that email — never from
 * anything in the form.
 */

type FormInputs = Record<string, { stringInputs?: { value?: string[] } }>;

export type ChatEvent = {
  type?: string;
  isDialogEvent?: boolean;
  dialogEventType?: "REQUEST_DIALOG" | "SUBMIT_DIALOG" | "CANCEL_DIALOG";
  user?: { email?: string; displayName?: string };
  space?: { name?: string };
  message?: { argumentText?: string; slashCommand?: { commandId?: string } };
  common?: { invokedFunction?: string; formInputs?: FormInputs };
};

type Profile = { id: string; name: string };

const FN_PROJECT_CHANGED = "debrief_project";
const FN_SUBMIT = "debrief_submit";

function formValue(event: ChatEvent, name: string) {
  return event.common?.formInputs?.[name]?.stringInputs?.value?.[0]?.trim() ?? "";
}

/** Comma-separated GOOGLE_CHAT_ALLOWED_EMAILS limits who can use the app; unset = anyone with a dashboard account. */
function isAllowed(email: string) {
  const list = (process.env.GOOGLE_CHAT_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || list.includes(email);
}

/** The dashboard account for this email, or why there isn't a usable one. */
async function findProfileByEmail(email: string): Promise<Profile | "no_account" | "cant_log"> {
  const admin = createAdminClient();
  // Emails live on auth.users, not public.users. The team is small enough
  // that one page of users covers everyone.
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const authUser = data?.users.find((u) => u.email?.toLowerCase() === email);
  if (!authUser) return "no_account";
  const { data: profile } = await admin
    .from("users")
    .select("id, name, role, role_id")
    .eq("id", authUser.id)
    .maybeSingle();
  if (!profile) return "no_account";
  // Posting a debrief writes a work log, so it needs the "add_logs"
  // permission. The Owner always has it.
  if (profile.role !== "owner") {
    if (!profile.role_id) return "cant_log";
    const { data: grant } = await admin
      .from("role_permissions")
      .select("permission_key")
      .eq("role_id", profile.role_id)
      .eq("permission_key", "add_logs")
      .maybeSingle();
    if (!grant) return "cant_log";
  }
  return { id: profile.id, name: profile.name };
}

/** Active tasks in projects that aren't completed, grouped by project. */
async function loadOpenTasks() {
  const admin = createAdminClient();
  const [{ data: projects }, { data: tasks }] = await Promise.all([
    admin.from("task_projects").select("id, name, completed_at").is("completed_at", null).order("name"),
    admin.from("tasks").select("id, title, project_id").eq("status", "active").order("title"),
  ]);
  return (projects ?? [])
    .map((p) => ({ id: p.id, name: p.name, tasks: (tasks ?? []).filter((t) => t.project_id === p.id) }))
    .filter((p) => p.tasks.length > 0);
}

function textResponse(text: string, privateTo?: ChatEvent["user"]) {
  return { text, ...(privateTo ? { privateMessageViewer: privateTo } : {}) };
}

function dialogResponse(body: object) {
  return { actionResponse: { type: "DIALOG", dialogAction: { dialog: { body } } } };
}

function closeDialog() {
  return { actionResponse: { type: "DIALOG", dialogAction: { actionStatus: { statusCode: "OK" } } } };
}

async function renderForm(opts: { projectId?: string; taskId?: string; update?: string; error?: string }) {
  const projects = await loadOpenTasks();
  if (projects.length === 0) {
    return dialogResponse({
      sections: [{ widgets: [{ textParagraph: { text: "There are no active tasks on the dashboard to log against yet." } }] }],
    });
  }

  const project = projects.find((p) => p.id === opts.projectId) ?? projects[0];
  const taskId = project.tasks.some((t) => t.id === opts.taskId) ? opts.taskId : project.tasks[0].id;

  const widgets: object[] = [];
  if (opts.error) widgets.push({ textParagraph: { text: `<font color="#b3261e">${opts.error}</font>` } });
  widgets.push(
    {
      selectionInput: {
        name: "project",
        label: "Project",
        type: "DROPDOWN",
        items: projects.map((p) => ({ text: p.name, value: p.id, selected: p.id === project.id })),
        onChangeAction: { function: FN_PROJECT_CHANGED },
      },
    },
    {
      selectionInput: {
        name: "task",
        label: "Task",
        type: "DROPDOWN",
        items: project.tasks.map((t) => ({ text: t.title, value: t.id, selected: t.id === taskId })),
      },
    },
    {
      textInput: {
        name: "update",
        label: "What did you work on?",
        type: "MULTIPLE_LINE",
        value: opts.update ?? "",
      },
    },
  );

  return dialogResponse({
    header: { title: "Debrief", subtitle: "Posts to this chat and logs it on the Mavs dashboard" },
    sections: [{ widgets }],
    fixedFooter: { primaryButton: { text: "Post", onClick: { action: { function: FN_SUBMIT } } } },
  });
}

async function submit(event: ChatEvent, profile: Profile) {
  const projectId = formValue(event, "project");
  const taskId = formValue(event, "task");
  const update = formValue(event, "update");
  if (!update) return renderForm({ projectId, taskId, error: "Write what you worked on first." });

  const admin = createAdminClient();
  const { data: task } = await admin
    .from("tasks")
    .select("id, title, status, project_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task || task.status !== "active" || task.project_id !== projectId) {
    return renderForm({ projectId, update, error: "That task isn't open anymore — pick another." });
  }

  const { error } = await admin.from("task_logs").insert({
    task_id: task.id,
    user_id: profile.id,
    description: update,
  });
  if (error) return renderForm({ projectId, taskId, update, error: "Couldn't save to the dashboard. Try again." });

  revalidatePath("/team/projects");
  revalidatePath("/team/projects/my-tasks");

  const { data: project } = await admin.from("task_projects").select("name").eq("id", projectId).maybeSingle();
  const projectName = project?.name ?? "Project";
  // No privateMessageViewer → visible to everyone in the space; returning a
  // message from a dialog submit also closes the dialog.
  return {
    actionResponse: { type: "NEW_MESSAGE" },
    text: `📝 *${profile.name}* · ${projectName} › ${task.title}\n${update}`,
  };
}

/** Routes one Google Chat event to a response body. */
export async function handleChatEvent(event: ChatEvent): Promise<object> {
  if (event.type === "ADDED_TO_SPACE") {
    return textResponse("Hi! Type /debrief to post an update here and log it on the Mavs dashboard.");
  }

  if (event.dialogEventType === "CANCEL_DIALOG") return closeDialog();

  const email = event.user?.email?.toLowerCase() ?? "";
  if (!email || !isAllowed(email)) {
    return event.isDialogEvent
      ? closeDialog()
      : textResponse("Debrief isn't turned on for your account yet.", event.user);
  }

  const profile = await findProfileByEmail(email);
  if (profile === "no_account") {
    return textResponse(
      `There's no Mavs dashboard account for ${email}. Ask a Senior Team Lead to add you.`,
      event.user,
    );
  }
  if (profile === "cant_log") {
    return textResponse(
      "Your dashboard role can't add work logs, so you can't post debriefs. Ask a Senior Team Lead.",
      event.user,
    );
  }

  if (event.isDialogEvent && event.dialogEventType === "REQUEST_DIALOG") {
    return renderForm({ update: event.message?.argumentText?.trim() });
  }

  if (event.common?.invokedFunction === FN_PROJECT_CHANGED) {
    return renderForm({ projectId: formValue(event, "project"), update: formValue(event, "update") });
  }

  if (event.common?.invokedFunction === FN_SUBMIT) return submit(event, profile);

  if (event.type === "MESSAGE") {
    return textResponse("Type /debrief to post an update and log it on the dashboard.", event.user);
  }
  return {};
}
