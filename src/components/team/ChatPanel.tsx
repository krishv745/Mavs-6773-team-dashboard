"use client";

import { useRef, useState, useTransition } from "react";
import { chatAction, confirmChatActionAction, type ChatMessage, type ProposedAction } from "@/lib/chat/actions";

function describeAction(action: ProposedAction): string {
  switch (action.type) {
    case "create_task":
      return `Create task "${action.title}" in ${action.projectName} (${action.subteam})${
        action.deadline ? `, due ${action.deadline}` : ""
      }`;
    case "create_event":
      return `Create event "${action.name}" on ${action.date}${action.startTime ? ` at ${action.startTime}` : ""}`;
    case "add_part":
      return `Add part "${action.name}" to inventory${action.qty ? ` (qty ${action.qty})` : ""}`;
    case "log_task_update":
      return `Log update on "${action.taskTitle}"${action.projectName ? ` (${action.projectName})` : ""}: "${action.description}"`;
  }
}

export default function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingAction, setPendingAction] = useState<ProposedAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, startSend] = useTransition();
  const [isConfirming, startConfirm] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  function send() {
    const text = input.trim();
    if (!text || isSending) return;
    setInput("");
    setError(null);
    setPendingAction(null);
    const history = messages;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    scrollToBottom();

    startSend(async () => {
      const result = await chatAction(text, history);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
      if (result.proposedAction) setPendingAction(result.proposedAction);
      scrollToBottom();
    });
  }

  function confirm() {
    if (!pendingAction) return;
    setError(null);
    startConfirm(async () => {
      const result = await confirmChatActionAction(pendingAction);
      if (result.error) {
        setError(result.error);
        return;
      }
      // On success the underlying action redirects the page, so there's
      // nothing further to render here.
    });
  }

  function cancelProposal() {
    setPendingAction(null);
    setMessages((prev) => [...prev, { role: "assistant", content: "Okay, not doing that." }]);
    scrollToBottom();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Team assistant"
        title="Team assistant"
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-navy text-white transition hover:bg-navy/90"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path
            d="M12 3a9 9 0 00-9 9c0 1.7.5 3.3 1.4 4.6L3 21l4.6-1.4A9 9 0 1012 3z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="fixed bottom-4 right-4 z-50 flex h-[32rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-hairline-strong bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-hairline bg-navy px-4 py-3">
            <p className="font-display text-sm font-bold text-white">Team assistant</p>
            <button type="button" onClick={() => setOpen(false)} className="text-white/70 hover:text-white" aria-label="Close">
              ✕
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-sm text-ink/50">
                Ask me to create a task, add an event, add a part, or log a work update — I&rsquo;ll propose it and
                you confirm before anything&rsquo;s saved.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.role === "user" ? "ml-auto bg-navy text-white" : "bg-tint text-ink"
                }`}
              >
                {m.content}
              </div>
            ))}
            {isSending && <p className="text-xs text-ink/40">Thinking…</p>}

            {pendingAction && (
              <div className="rounded-lg border border-navy/20 bg-navy/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-navy/70">Proposed</p>
                <p className="mt-1 text-sm text-ink">{describeAction(pendingAction)}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={cancelProposal}
                    disabled={isConfirming}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-ink/60 hover:bg-tint disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirm}
                    disabled={isConfirming}
                    className="rounded-md bg-crimson px-3 py-1.5 text-xs font-semibold text-white hover:bg-crimson-bright disabled:opacity-50"
                  >
                    {isConfirming ? "Saving…" : "Confirm"}
                  </button>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-crimson">{error}</p>}
          </div>

          <div className="flex items-center gap-2 border-t border-hairline p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder="e.g. add a task to..."
              className="w-full rounded-md border border-hairline-strong px-3 py-2 text-sm outline-none focus:border-navy"
            />
            <button
              type="button"
              onClick={send}
              disabled={isSending || !input.trim()}
              className="flex-none rounded-md bg-navy px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
