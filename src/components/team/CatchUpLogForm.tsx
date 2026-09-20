"use client";

import { useActionState } from "react";
import { submitCatchUpLogAction, skipCatchUpLogAction } from "@/lib/sessionLog/actions";
import NoteFields from "@/components/team/NoteFields";
import SubmitButton from "@/components/team/SubmitButton";

export default function CatchUpLogForm({ sessionId }: { sessionId: string }) {
  const [state, formAction] = useActionState(submitCatchUpLogAction, undefined);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="sessionId" value={sessionId} />

      <NoteFields label="What did you work on?" />

      {state?.error && (
        <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <SubmitButton>Submit log</SubmitButton>
        <button
          type="submit"
          formAction={skipCatchUpLogAction}
          className="flex-1 rounded-md border border-hairline-strong px-4 py-2.5 text-sm font-semibold text-ink/60 transition hover:bg-tint"
        >
          Skip — I don&rsquo;t remember
        </button>
      </div>
    </form>
  );
}
