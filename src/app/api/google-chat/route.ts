import { NextResponse } from "next/server";
import { isFromGoogleChat } from "@/lib/googleChat/verify";
import { handleChatEvent, type ChatEvent } from "@/lib/googleChat/debrief";

/**
 * HTTP endpoint for the Google Chat "/debrief" app — set as the app's
 * endpoint URL in the Google Cloud console (Chat API → Configuration).
 * Outside /team, so the session middleware doesn't run here; Google's signed
 * bearer token is the only way in.
 */
export async function POST(request: Request) {
  if (!(await isFromGoogleChat(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = (await request.json()) as ChatEvent;
  return NextResponse.json(await handleChatEvent(event));
}
