"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clockIn, clockOut } from "@/lib/clock";
import { PLACEHOLDER_EMAIL_DOMAIN } from "@/lib/auth/constants";

export type ActionState = { error?: string } | undefined;
export type PasswordResetState = { error?: string; info?: string } | undefined;

async function signInAndClockIn(email: string, password: string): Promise<ActionState> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: "Incorrect username or password." };
  }
  await clockIn(data.user.id);
  return undefined;
}

export async function logInAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Enter your username and password." };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id, role")
    .eq("username_lower", username.toLowerCase())
    .maybeSingle();

  if (!profile) {
    return { error: "Incorrect username or password." };
  }

  const { data: authUser, error: lookupError } = await admin.auth.admin.getUserById(profile.id);
  if (lookupError || !authUser.user?.email) {
    return { error: "Incorrect username or password." };
  }

  const result = await signInAndClockIn(authUser.user.email, password);
  if (result?.error) return result;

  redirect(profile.role === "parent" ? "/team/events" : "/team/projects");
}

export async function setNewPasswordAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords don't match." };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session expired. Log in again." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }

  const admin = createAdminClient();
  await admin.from("users").update({ must_reset_password: false }).eq("id", user.id);

  redirect("/team/projects");
}

const GENERIC_RESET_INFO =
  "If that username has an email on file, we've sent a password reset link to it.";

export async function requestPasswordResetAction(
  _prevState: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  const username = String(formData.get("username") ?? "").trim();
  if (!username) return { error: "Enter your username." };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id")
    .eq("username_lower", username.toLowerCase())
    .maybeSingle();

  // Same message whether or not the username exists, so this can't be used
  // to enumerate valid usernames.
  if (!profile) return { info: GENERIC_RESET_INFO };

  const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
  const email = authUser.user?.email;
  if (!email) return { info: GENERIC_RESET_INFO };

  if (email.endsWith(PLACEHOLDER_EMAIL_DOMAIN)) {
    return {
      info:
        "Your account was created by a Team Lead and doesn't have an email on file. Ask a Team Lead or the Owner to reset your password from the Admin Dashboard.",
    };
  }

  const headersList = await headers();
  const origin = headersList.get("origin") ?? `https://${headersList.get("host")}`;

  const supabase = await createServerClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/team/reset-password`,
  });

  return { info: GENERIC_RESET_INFO };
}

/**
 * The single "end my session" action. If there's an open clock session it
 * gets clocked out; either way the user is fully signed out and sent to the
 * login screen — there's no separate "log out" button in the app.
 */
export async function endSessionAction() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await clockOut(user.id);
  }
  await supabase.auth.signOut();
  redirect("/team/login");
}
