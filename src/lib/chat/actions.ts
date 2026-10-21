"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTaskAction, addTaskLogFromDashboardAction } from "@/lib/tasks/actions";
import { createEventAction } from "@/lib/events/actions";
import { createPartAction } from "@/lib/parts/actions";
import { SUBTEAMS } from "@/lib/subteams";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ProposedAction =
  | {
      type: "create_task";
      projectId: string;
      projectName: string;
      title: string;
      subteam: string;
      deadline: string | null;
      description: string | null;
    }
  | {
      type: "create_event";
      name: string;
      date: string;
      startTime: string | null;
      endTime: string | null;
      info: string | null;
    }
  | { type: "add_part"; name: string; link: string | null; partNumber: string | null; location: string | null; qty: number }
  | { type: "log_task_update"; taskId: string; taskTitle: string; projectName: string | null; description: string };

export type ChatResult = { reply: string; proposedAction?: ProposedAction; error?: string };

const TOOLS: Anthropic.Tool[] = [
  {
    name: "propose_create_task",
    description:
      "Propose creating a new task in a project. Only call this once you know the project, a clear title, and a subteam — ask a clarifying question in plain text first if any of those is missing or ambiguous.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "The id of the project, copied exactly from the Available projects list." },
        title: { type: "string" },
        subteam: { type: "string", description: "One of the valid subteam values listed in the system prompt." },
        deadline: { type: "string", description: "YYYY-MM-DD, optional." },
        description: { type: "string", description: "Optional longer description." },
      },
      required: ["project_id", "title", "subteam"],
    },
  },
  {
    name: "propose_create_event",
    description:
      "Propose creating a new event (a meeting, competition, outreach event, etc). Only call this once you know a name and a date.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        start_time: { type: "string", description: "24h HH:MM, optional." },
        end_time: { type: "string", description: "24h HH:MM, optional." },
        info: { type: "string", description: "Optional description shown to volunteers." },
      },
      required: ["name", "date"],
    },
  },
  {
    name: "propose_add_part",
    description: "Propose adding a new part to Build inventory. Only call this once you know at least a name.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        link: { type: "string", description: "Vendor product link, optional." },
        part_number: { type: "string" },
        location: { type: "string" },
        qty: { type: "number", description: "Starting quantity in stock, defaults to 0 if omitted." },
      },
      required: ["name"],
    },
  },
  {
    name: "propose_log_task_update",
    description:
      "Propose logging a work update against an existing task. Give your best guess at the task's title (and its project name if you know it) — exact matching against real tasks happens after your turn, so don't worry about getting the id.",
    input_schema: {
      type: "object",
      properties: {
        task_title: { type: "string" },
        project_name: { type: "string", description: "Optional, helps disambiguate if multiple tasks share a similar title." },
        description: { type: "string", description: "What was done — the actual log entry text." },
      },
      required: ["task_title", "description"],
    },
  },
];

export async function chatAction(message: string, history: ChatMessage[]): Promise<ChatResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { reply: "", error: "You must be signed in." };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { reply: "", error: "The chat assistant isn't set up yet — ask an Owner to add an API key." };
  }

  const admin = createAdminClient();
  const { data: projects } = await admin.from("task_projects").select("id, name").order("name", { ascending: true });
  const projectList = (projects ?? []).length
    ? (projects ?? []).map((p) => `- ${p.name} (id: ${p.id})`).join("\n")
    : "(no projects exist yet — a task can't be created until one does)";
  const subteamList = SUBTEAMS.map((s) => `${s.value} (${s.label})`).join(", ");

  const systemPrompt = `You are the team assistant embedded in FRC Max Throttle Mavericks 6773's app. You help members create tasks, events, and parts, and log work updates, by proposing one action at a time for the member to confirm before anything is actually saved — you never write directly, you only propose.

Available projects (Projects tab):
${projectList}

Valid subteams: ${subteamList}

Rules:
- Call at most one tool per turn, and only once you have enough information — otherwise ask a short, specific clarifying question in plain text instead.
- Never invent a project_id — only use ids copied exactly from the list above.
- Keep replies brief and conversational; you're a teammate, not a form.
- If the request has nothing to do with creating a task/event/part or logging a task update, say so and explain what you can actually help with.`;

  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 600,
      system: systemPrompt,
      tools: TOOLS,
      messages: [...history.map((h) => ({ role: h.role, content: h.content })), { role: "user" as const, content: message }],
    });
  } catch {
    return { reply: "", error: "Couldn't reach the assistant. Try again in a moment." };
  }

  if (response.stop_reason === "refusal") {
    return { reply: "I can't help with that." };
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const toolBlock = response.content.find((b) => b.type === "tool_use");
  const fallbackReply = textBlock && "text" in textBlock ? textBlock.text.trim() : "";

  if (!toolBlock || toolBlock.type !== "tool_use") {
    return { reply: fallbackReply || "Could you say a bit more about what you'd like to do?" };
  }

  const input = toolBlock.input as Record<string, unknown>;

  if (toolBlock.name === "propose_create_task") {
    const projectId = String(input.project_id ?? "");
    const project = (projects ?? []).find((p) => p.id === projectId);
    if (!project) return { reply: "I couldn't match that to a real project — which project should this task go in?" };
    const subteam = String(input.subteam ?? "");
    if (!SUBTEAMS.some((s) => s.value === subteam)) {
      return { reply: `"${subteam}" isn't one of the subteams — which of these did you mean: ${subteamList}?` };
    }
    const title = String(input.title ?? "").trim();
    if (!title) return { reply: "What should the task be called?" };

    return {
      reply: fallbackReply || `Ready to create "${title}" in ${project.name}.`,
      proposedAction: {
        type: "create_task",
        projectId: project.id,
        projectName: project.name,
        title,
        subteam,
        deadline: input.deadline ? String(input.deadline) : null,
        description: input.description ? String(input.description) : null,
      },
    };
  }

  if (toolBlock.name === "propose_create_event") {
    const name = String(input.name ?? "").trim();
    const date = String(input.date ?? "").trim();
    if (!name || !date) return { reply: "I need at least an event name and a date." };

    return {
      reply: fallbackReply || `Ready to create "${name}" on ${date}.`,
      proposedAction: {
        type: "create_event",
        name,
        date,
        startTime: input.start_time ? String(input.start_time) : null,
        endTime: input.end_time ? String(input.end_time) : null,
        info: input.info ? String(input.info) : null,
      },
    };
  }

  if (toolBlock.name === "propose_add_part") {
    const name = String(input.name ?? "").trim();
    if (!name) return { reply: "What's the part called?" };

    return {
      reply: fallbackReply || `Ready to add "${name}" to inventory.`,
      proposedAction: {
        type: "add_part",
        name,
        link: input.link ? String(input.link) : null,
        partNumber: input.part_number ? String(input.part_number) : null,
        location: input.location ? String(input.location) : null,
        qty: typeof input.qty === "number" ? input.qty : 0,
      },
    };
  }

  if (toolBlock.name === "propose_log_task_update") {
    const taskTitle = String(input.task_title ?? "").trim();
    const projectName = input.project_name ? String(input.project_name).trim() : null;
    const description = String(input.description ?? "").trim();
    if (!taskTitle || !description) return { reply: "Which task, and what should the update say?" };

    const { data: matches } = await admin
      .from("tasks")
      .select("id, title, project_id")
      .eq("status", "active")
      .ilike("title", `%${taskTitle}%`);
    let candidates = matches ?? [];

    if (candidates.length > 1 && projectName) {
      const project = (projects ?? []).find((p) => p.name.toLowerCase().includes(projectName.toLowerCase()));
      if (project) candidates = candidates.filter((c) => c.project_id === project.id);
    }

    if (candidates.length === 0) {
      return { reply: `I couldn't find an active task matching "${taskTitle}" — could you check the title?` };
    }
    if (candidates.length > 1) {
      const names = candidates.map((c) => `"${c.title}"`).join(", ");
      return { reply: `A few tasks match "${taskTitle}": ${names}. Which one did you mean?` };
    }

    const task = candidates[0];
    const project = (projects ?? []).find((p) => p.id === task.project_id);

    return {
      reply: fallbackReply || `Ready to log this update on "${task.title}".`,
      proposedAction: {
        type: "log_task_update",
        taskId: task.id,
        taskTitle: task.title,
        projectName: project?.name ?? null,
        description,
      },
    };
  }

  return { reply: fallbackReply || "I'm not sure how to do that yet." };
}

/** Executes a proposed action by calling the same server actions every other part of the app uses — every existing permission check and validation applies automatically, and this never writes to Supabase on its own. */
export async function confirmChatActionAction(action: ProposedAction): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  if (action.type === "create_task") {
    const fd = new FormData();
    fd.set("projectId", action.projectId);
    fd.set("title", action.title);
    fd.set("subteam", action.subteam);
    if (action.deadline) fd.set("deadline", action.deadline);
    if (action.description) fd.set("description", action.description);
    const result = await createTaskAction(undefined, fd);
    if (result?.error) return { error: result.error };
    return {};
  }

  if (action.type === "create_event") {
    const fd = new FormData();
    fd.set("name", action.name);
    fd.set("date", action.date);
    if (action.startTime) fd.set("startTime", action.startTime);
    if (action.endTime) fd.set("endTime", action.endTime);
    if (action.info) fd.set("info", action.info);
    const result = await createEventAction(undefined, fd);
    if (result?.error) return { error: result.error };
    return {};
  }

  if (action.type === "add_part") {
    const fd = new FormData();
    fd.set("name", action.name);
    if (action.link) fd.set("link", action.link);
    if (action.partNumber) fd.set("partNumber", action.partNumber);
    if (action.location) fd.set("location", action.location);
    fd.set("qty", String(action.qty));
    const result = await createPartAction(undefined, fd);
    if (result?.error) return { error: result.error };
    return {};
  }

  if (action.type === "log_task_update") {
    const fd = new FormData();
    fd.set("taskId", action.taskId);
    fd.set("description", action.description);
    const result = await addTaskLogFromDashboardAction(undefined, fd);
    if (result?.error) return { error: result.error };
    revalidatePath("/team/projects");
    return {};
  }

  return { error: "Unrecognized action." };
}
