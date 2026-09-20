"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { setNewPasswordAction } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/client";
import PasswordField from "@/components/team/PasswordField";
import SubmitButton from "@/components/team/SubmitButton";

/**
 * Reached two ways: (1) already signed in and forced to pick a real password
 * on first login, where a session already exists — or (2) a "reset password"
 * email link, which lands here with recovery tokens in the URL fragment that
 * the browser Supabase client picks up automatically on mount. Either way we
 * just need to confirm a session exists before showing the form.
 */
export default function ResetPasswordPage() {
  const [state, formAction] = useActionState(setNewPasswordAction, undefined);
  const [status, setStatus] = useState<"checking" | "ready" | "expired">("checking");

  useEffect(() => {
    const supabase = createClient();
    let settled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !settled) {
        settled = true;
        setStatus("ready");
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && !settled) {
        settled = true;
        setStatus("ready");
      }
    });

    const timeout = setTimeout(() => {
      if (!settled) setStatus("expired");
    }, 4000);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  if (status === "checking") {
    return <p className="text-center text-sm text-ink/50">Checking your link…</p>;
  }

  if (status === "expired") {
    return (
      <>
        <h1 className="font-display text-2xl font-bold text-ink">Link expired</h1>
        <p className="mt-2 text-sm text-ink/60">
          This reset link is invalid or has expired.
        </p>
        <Link
          href="/team/forgot-password"
          className="mt-5 inline-block text-sm font-semibold text-crimson hover:text-crimson-bright"
        >
          Request a new link →
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-ink">Set your password</h1>
      <p className="mt-1 text-sm text-ink/60">
        Choose a password only you know before continuing.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <PasswordField name="password" label="New password (8+ characters)" autoComplete="new-password" />
        <PasswordField name="confirm" label="Confirm new password" autoComplete="new-password" />

        {state?.error && (
          <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
        )}

        <SubmitButton>Save and continue</SubmitButton>
      </form>
    </>
  );
}
