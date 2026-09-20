"use client";

import Link from "next/link";
import { useActionState } from "react";
import { logInAction } from "@/lib/auth/actions";
import PasswordField from "@/components/team/PasswordField";
import SubmitButton from "@/components/team/SubmitButton";

export default function LoginPage() {
  const [state, formAction] = useActionState(logInAction, undefined);

  return (
    <>
      <h1 className="font-display text-2xl font-bold text-ink">Sign in</h1>
      <p className="mt-1 text-sm text-ink/60">
        Logging in clocks you in automatically.
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

        <PasswordField name="password" label="Password" autoComplete="current-password" />

        <div className="text-right">
          <Link
            href="/team/forgot-password"
            className="text-sm font-medium text-ink/50 transition hover:text-crimson"
          >
            Forgot password?
          </Link>
        </div>

        {state?.error && (
          <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
        )}

        <SubmitButton>Sign in</SubmitButton>
      </form>
    </>
  );
}
