"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordResetAction } from "@/lib/auth/actions";
import SubmitButton from "@/components/team/SubmitButton";

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(requestPasswordResetAction, undefined);

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-ink">Reset your password</h1>
      <p className="mt-1 text-sm text-ink/60">
        Enter your username and we&rsquo;ll email you a reset link, if we have
        one on file.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="username" className="text-sm font-medium text-ink/80">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            required
            autoComplete="username"
            className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/10"
          />
        </div>

        {state?.error && (
          <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
        )}
        {state?.info && (
          <p className="rounded-md bg-navy/10 px-3 py-2 text-sm text-navy">{state.info}</p>
        )}

        <SubmitButton>Send reset link</SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-ink/60">
        Remembered it?{" "}
        <Link href="/team/login" className="font-semibold text-crimson hover:text-crimson-bright">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
