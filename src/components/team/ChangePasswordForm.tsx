"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/lib/profile/actions";
import PasswordField from "@/components/team/PasswordField";
import SubmitButton from "@/components/team/SubmitButton";

export default function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, undefined);

  return (
    <form action={formAction} className="space-y-5" key={state?.success ? "reset" : "form"}>
      <PasswordField name="password" label="New password (8+ characters)" autoComplete="new-password" />
      <PasswordField name="confirm" label="Confirm new password" autoComplete="new-password" />

      {state?.error && (
        <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
      )}
      {state?.success && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Password updated.</p>
      )}

      <SubmitButton>Update password</SubmitButton>
    </form>
  );
}
