import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { roleLabel } from "@/lib/roles";
import ProfileForm from "@/components/team/ProfileForm";
import ChangePasswordForm from "@/components/team/ChangePasswordForm";

export default async function ProfilePage() {
  const supabase = await createServerClient();
  const [profile, { data: authData }] = await Promise.all([
    getCurrentProfile(),
    supabase.auth.getUser(),
  ]);
  if (!profile) redirect("/team/login");

  const { data: customRole } = profile.role_id
    ? await supabase.from("roles").select("name").eq("id", profile.role_id).maybeSingle()
    : { data: null };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-2xl font-bold text-ink">Your profile</h1>
      <p className="mt-1 text-sm text-ink/50">{customRole?.name ?? roleLabel(profile.role)}</p>

      <div className="mt-6 rounded-xl border border-hairline bg-surface p-6">
        <ProfileForm
          name={profile.name}
          email={authData.user?.email ?? ""}
          phone={profile.phone ?? ""}
          bio={profile.bio ?? ""}
          avatarUrl={profile.avatar_url}
        />
      </div>

      <h2 className="mt-8 font-display text-lg font-bold text-ink">Change password</h2>
      <div className="mt-3 rounded-xl border border-hairline bg-surface p-6">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
