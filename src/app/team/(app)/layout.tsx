import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import AppHeader from "@/components/team/AppHeader";
import ThemeProvider from "@/components/team/ThemeProvider";

export default async function TeamAppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/team/login");

  return (
    <ThemeProvider initialTheme={profile.theme ?? "system"}>
      <AppHeader profile={profile} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </ThemeProvider>
  );
}
