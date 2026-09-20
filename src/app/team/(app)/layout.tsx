import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getOpenSession } from "@/lib/clock";
import { createClient as createServerClient } from "@/lib/supabase/server";
import AppHeader from "@/components/team/AppHeader";
import ThemeProvider from "@/components/team/ThemeProvider";

export default async function TeamAppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/team/login");

  const openSession = await getOpenSession(profile.id);

  let hasLoggedThisSession = true;
  if (openSession) {
    const supabase = await createServerClient();
    const { data } = await supabase
      .from("task_logs")
      .select("id")
      .eq("clock_session_id", openSession.id)
      .limit(1)
      .maybeSingle();
    hasLoggedThisSession = Boolean(data);
  }

  return (
    <ThemeProvider initialTheme={profile.theme ?? "system"}>
      <AppHeader
        profile={profile}
        clockInAt={openSession?.clock_in ?? null}
        hasLoggedThisSession={hasLoggedThisSession}
      />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </ThemeProvider>
  );
}
