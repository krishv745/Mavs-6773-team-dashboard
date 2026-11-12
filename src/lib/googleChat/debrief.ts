import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Google Chat "/debrief" app, built as a Google Workspace add-on (the event
 * and response format Google requires for new Chat apps). The slash command
 * is configured to open a dialog:
 *
 *   /debrief            → appCommandPayload, REQUEST_DIALOG → project / task / update form
 *   change the project  → action=project → same form, task list for that project
 *   click "Post"        → action=submit  → task_logs row + a message posted to
 *                                           the whole space, dialog closes
 *
 * Who's posting comes only from Google's signed event (chat.user.email),
 * matched against the dashboard account with that email — never from
 * anything in the form.
 */

type FormInputs = Record<string, { stringInputs?: { value?: string[] } }>;
type ChatUser = { name?: string; email?: string; displayName?: string };
type DialogFields = {
  isDialogEvent?: boolean;
  dialogEventType?: "REQUEST_DIALOG" | "SUBMIT_DIALOG" | "CANCEL_DIALOG";
  message?: { argumentText?: string };
};

export type ChatEvent = {
  commonEventObject?: { parameters?: Record<string, string>; formInputs?: FormInputs };
  chat?: {
    user?: ChatUser;
    addedToSpacePayload?: object;
    messagePayload?: { message?: { argumentText?: string } };
    appCommandPayload?: DialogFields;
    buttonClickedPayload?: DialogFields;
    widgetUpdatedPayload?: DialogFields;
  };
};

type Profile = { id: string; name: string };

const ACTION_PROJECT_CHANGED = "project";
const ACTION_SUBMIT = "submit";
const ACTION_OPEN = "open";

function formValue(event: ChatEvent, name: string) {
  return event.commonEventObject?.formInputs?.[name]?.stringInputs?.value?.[0]?.trim() ?? "";
}

/** Add-on HTTP actions call a URL, not a function name; the endpoint routes on the "action" parameter. */
function endpointAction(action: string) {
  return { function: process.env.GOOGLE_CHAT_AUDIENCE ?? "", parameters: [{ key: "action", value: action }] };
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

function textResponse(text: string, privateTo?: ChatUser) {
  const message = { text, ...(privateTo?.name ? { privateMessageViewer: { name: privateTo.name } } : {}) };
  return { hostAppDataAction: { chatDataAction: { createMessageAction: { message } } } };
}

/** Opens a dialog (pushCard) or replaces the open one (updateCard). */
function dialogResponse(card: object, update = false) {
  return { action: { navigations: [update ? { updateCard: card } : { pushCard: card }] } };
}

function closeDialog() {
  return { action: { navigations: [{ endNavigation: { action: "CLOSE_DIALOG" } }] } };
}

/** A private message with a button that opens the debrief form, carrying any text typed after /debrief. */
function openFormButton(user: ChatUser | undefined, update?: string) {
  const parameters = [{ key: "action", value: ACTION_OPEN }];
  if (update) parameters.push({ key: "update", value: update });
  const button = {
    text: "Open debrief form",
    onClick: { action: { function: process.env.GOOGLE_CHAT_AUDIENCE ?? "", parameters, interaction: "OPEN_DIALOG" } },
  };
  const message = {
    cardsV2: [{ cardId: "debrief", card: { sections: [{ widgets: [{ buttonList: { buttons: [button] } }] }] } }],
    ...(user?.name ? { privateMessageViewer: { name: user.name } } : {}),
  };
  return { hostAppDataAction: { chatDataAction: { createMessageAction: { message } } } };
}

function messageCard(text: string) {
  return { sections: [{ widgets: [{ textParagraph: { text } }] }] };
}

async function renderForm(
  opts: { projectId?: string; taskId?: string; update?: string; error?: string },
  update = false,
) {
  const projects = await loadOpenTasks();
  if (projects.length === 0) {
    return dialogResponse(messageCard("There are no active tasks on the dashboard to log against yet."), update);
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
        onChangeAction: endpointAction(ACTION_PROJECT_CHANGED),
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

  return dialogResponse(
    {
      header: { title: "Debrief", subtitle: "Posts to this chat and logs it on the Mavs dashboard" },
      sections: [{ widgets }],
      fixedFooter: { primaryButton: { text: "Post", onClick: { action: endpointAction(ACTION_SUBMIT) } } },
    },
    update,
  );
}

async function submit(event: ChatEvent, profile: Profile) {
  const projectId = formValue(event, "project");
  const taskId = formValue(event, "task");
  const update = formValue(event, "update");
  if (!update) return renderForm({ projectId, taskId, error: "Write what you worked on first." }, true);

  const admin = createAdminClient();
  const { data: task } = await admin
    .from("tasks")
    .select("id, title, status, project_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task || task.status !== "active" || task.project_id !== projectId) {
    return renderForm({ projectId, update, error: "That task isn't open anymore — pick another." }, true);
  }

  const { error } = await admin.from("task_logs").insert({
    task_id: task.id,
    user_id: profile.id,
    description: update,
  });
  if (error) return renderForm({ projectId, taskId, update, error: "Couldn't save to the dashboard. Try again." }, true);

  revalidatePath("/team/projects");
  revalidatePath("/team/projects/my-tasks");

  const { data: project } = await admin.from("task_projects").select("name").eq("id", projectId).maybeSingle();
  const projectName = project?.name ?? "Project";
  // No privateMessageViewer → visible to everyone in the space; returning a
  // message from a dialog submit also closes the dialog.
  return textResponse(`📝 **${profile.name}** · ${projectName} › ${task.title}\n${update}`);
}

/** Routes one Google Chat (add-on) event to a response body. */
export async function handleChatEvent(event: ChatEvent): Promise<object> {
  const chat = event.chat ?? {};
  if (chat.addedToSpacePayload) {
    return textResponse("Hi! Type /debrief to post an update here and log it on the Mavs dashboard.");
  }

  const dialog = chat.appCommandPayload ?? chat.buttonClickedPayload ?? chat.widgetUpdatedPayload;
  const action = event.commonEventObject?.parameters?.action;
  const inDialog = Boolean(dialog?.isDialogEvent || action);
  if (dialog?.dialogEventType === "CANCEL_DIALOG") return closeDialog();

  // Inside a dialog, problems are shown in the dialog; otherwise as a private reply.
  const refuse = (text: string) =>
    inDialog ? dialogResponse(messageCard(text), Boolean(action)) : textResponse(text, chat.user);

  const email = chat.user?.email?.toLowerCase() ?? "";
  if (!email || !isAllowed(email)) return refuse("Debrief isn't turned on for your account yet.");

  const profile = await findProfileByEmail(email);
  if (profile === "no_account") {
    return refuse(`There's no Mavs dashboard account for ${email}. Ask a Senior Team Lead to add you.`);
  }
  if (profile === "cant_log") {
    return refuse("Your dashboard role can't add work logs, so you can't post debriefs. Ask a Senior Team Lead.");
  }

  if (action === ACTION_PROJECT_CHANGED) {
    return renderForm({ projectId: formValue(event, "project"), update: formValue(event, "update") }, true);
  }
  if (action === ACTION_SUBMIT) return submit(event, profile);

  if (action === ACTION_OPEN) {
    return renderForm({ update: event.commonEventObject?.parameters?.update });
  }

  if (chat.appCommandPayload) {
    const update = chat.appCommandPayload.message?.argumentText?.trim();
    if (chat.appCommandPayload.isDialogEvent) return renderForm({ update });
    // The command isn't set to "Open a dialog" in the Chat API config, so
    // Chat wants a message back: send a button that opens the form.
    return openFormButton(chat.user, update);
  }

  return textResponse("Type /debrief to post an update and log it on the dashboard.", chat.user);
}
