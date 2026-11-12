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
  const response = await handleChatEvent(event);
  // Which kind of event came in and which kind of reply went out — no
  // message text or emails — so a silent failure in Chat can be traced.
  const chat = event.chat ?? {};
  const payload = Object.keys(chat).find((k) => k.endsWith("Payload")) ?? "none";
  const dialog = chat.appCommandPayload ?? chat.buttonClickedPayload ?? chat.widgetUpdatedPayload;
  console.log(
    `[google-chat] ${payload} dialog=${dialog?.isDialogEvent ?? false}/${dialog?.dialogEventType ?? "-"} ` +
      `action=${event.commonEventObject?.parameters?.action ?? "-"} → ` +
      (JSON.stringify(response).match(/pushCard|updateCard|endNavigation|cardsV2|createMessageAction/)?.[0] ?? "empty"),
  );
  return NextResponse.json(response);
}
