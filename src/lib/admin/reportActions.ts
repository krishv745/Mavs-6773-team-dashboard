"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { formatShortDate } from "@/lib/formatTime";

export async function summarizeReportAction(
  start: string,
  end: string,
  personIds: string[] = [],
): Promise<{ summary?: string; error?: string }> {
  const profile = await getCurrentProfile();
  if (!hasPermission(profile, "view_admin_hours")) return { error: "Not authorized." };

  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "This feature is unavailable at the moment." };
  }

  const rangeStartIso = `${start}T00:00:00.000Z`;
  const rangeEndExclusive = new Date(`${end}T00:00:00.000Z`);
  rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1);
  const rangeEndIso = rangeEndExclusive.toISOString();

  const admin = createAdminClient();
  let logsQuery = admin
    .from("task_logs")
    .select("task_id, user_id, timestamp, description, audio_transcript")
    .gte("timestamp", rangeStartIso)
    .lt("timestamp", rangeEndIso)
    .order("timestamp", { ascending: true })
    .limit(300);
  if (personIds.length > 0) {
    logsQuery = logsQuery.in("user_id", personIds);
  }
  const { data: logs } = await logsQuery;

  if (!logs || logs.length === 0) {
    return { summary: "Nothing was logged in this date range." };
  }

  const userIds = [...new Set(logs.map((l) => l.user_id).filter((id): id is string => Boolean(id)))];
  const taskIds = [...new Set(logs.map((l) => l.task_id).filter((id): id is string => Boolean(id)))];
  const [{ data: users }, { data: tasks }] = await Promise.all([
    userIds.length ? admin.from("users").select("id, name").in("id", userIds) : Promise.resolve({ data: [] }),
    taskIds.length ? admin.from("tasks").select("id, title").in("id", taskIds) : Promise.resolve({ data: [] }),
  ]);
  const userName = new Map((users ?? []).map((u) => [u.id, u.name]));
  const taskTitle = new Map((tasks ?? []).map((t) => [t.id, t.title]));

  const digest = logs
    .map((l) => {
      const who = (l.user_id && userName.get(l.user_id)) ?? "someone";
      const what = l.task_id ? (taskTitle.get(l.task_id) ?? "a task") : "a general update";
      const note = l.description || l.audio_transcript || "(no note text)";
      const date = formatShortDate(l.timestamp);
      return `- [${date}] ${who} on "${what}": ${note}`;
    })
    .join("\n");

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 400,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system:
        "You summarize FTC robotics team work logs for a team lead who needs the gist in a few seconds. Write two to three plain sentences covering what got done and by whom, in a natural tone. No headers, no bullet points, no preamble.",
      messages: [
        {
          role: "user",
          content: `Summarize this activity log from ${start} to ${end}:\n\n${digest}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return { error: "Couldn't generate a summary for this range. Try again." };
    }

    const text = response.content.find((b) => b.type === "text")?.text;
    return { summary: text?.trim() || "Couldn't generate a summary — try again." };
  } catch {
    return { error: "Couldn't reach the AI summarizer. Check the API key and try again." };
  }
}
