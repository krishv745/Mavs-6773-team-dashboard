"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth/session";

export type ProfileState = { error?: string; success?: boolean } | undefined;

export async function updateProfileAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const avatar = formData.get("avatar");

  if (!name) return { error: "Name is required." };
  if (!email || !email.includes("@")) return { error: "Enter a valid email." };
  if (bio.length > 2000) return { error: "Bio must be 2000 characters or fewer." };

  const admin = createAdminClient();

  const { error: emailError } = await admin.auth.admin.updateUserById(profile.id, {
    email,
    email_confirm: true,
  });
  if (emailError) {
    return {
      error: emailError.message.includes("already been registered")
        ? "That email is already in use."
        : "Could not update email. Try again.",
    };
  }

  let avatarUrl: string | undefined;
  if (avatar instanceof File && avatar.size > 0) {
    const ext = avatar.name.split(".").pop() || "jpg";
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, avatar, { contentType: avatar.type, upsert: true });
    if (!uploadError) {
      avatarUrl = admin.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }
  }

  const { error: updateError } = await admin
    .from("users")
    .update({ name, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) })
    .eq("id", profile.id);
  if (updateError) return { error: "Could not save your profile. Try again." };

  // phone/bio are in a separate update, deliberately allowed to fail without
  // taking the save above down with it: both columns were added after this
  // form shipped, and if that migration hasn't been run yet on this database
  // the name/email/photo save above should still go through instead of the
  // whole thing erroring out. PGRST204 is PostgREST's "no such column in the
  // schema cache" code — exactly what a missing migration looks like here.
  const { error: extraError } = await admin
    .from("users")
    .update({ phone: phone || null, bio: bio || null })
    .eq("id", profile.id);

  revalidatePath("/team/profile");
  if (extraError) {
    return {
      success: true,
      error:
        extraError.code === "PGRST204"
          ? "Saved your name/email/photo — phone and bio need a pending database update before they can be saved (ask whoever manages the database)."
          : "Saved your name/email/photo, but phone and bio couldn't be saved. Try again.",
    };
  }
  return { success: true };
}

export async function changePasswordAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "You must be signed in." };

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords don't match." };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  return { success: true };
}
