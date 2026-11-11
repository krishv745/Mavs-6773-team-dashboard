"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { endSessionAction } from "@/lib/auth/actions";
import Avatar from "@/components/team/Avatar";
import ChatPanel from "@/components/team/ChatPanel";
import ThemeToggle from "@/components/team/ThemeToggle";
import { hasPermission } from "@/lib/permissions";
import { APP_NAME, TEAM_NAME } from "@/lib/brand";
import type { Profile } from "@/lib/auth/session";

const MEMBER_TABS = [
  { href: "/team/projects", label: "Projects" },
  { href: "/team/events", label: "Events" },
  { href: "/team/build", label: "Build" },
  { href: "/team/log", label: "Logs" },
];

export default function AppHeader({ profile }: { profile: Profile }) {
  const pathname = usePathname();

  const canSeeAdmin =
    hasPermission(profile, "view_admin_hours") ||
    hasPermission(profile, "manage_members") ||
    hasPermission(profile, "manage_roles") ||
    hasPermission(profile, "manage_events");
  const tabs = canSeeAdmin ? [...MEMBER_TABS, { href: "/team/admin", label: "Admin" }] : MEMBER_TABS;

  const homeHref = "/team/projects";

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link href={homeHref} className="flex items-center gap-2.5">
            <Image src="/logo.png" alt={TEAM_NAME} width={36} height={36} />
            <span className="hidden flex-col leading-none sm:flex">
              <span className="font-display text-base font-bold uppercase text-navy">{APP_NAME}</span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink/50">{TEAM_NAME}</span>
            </span>
          </Link>
          <ThemeToggle />
          <Link href="/team/profile" title="Your profile" className="flex-none">
            <Avatar name={profile.name} avatarUrl={profile.avatar_url} size="xs" />
          </Link>
          <ChatPanel />
        </div>

        <nav className="flex flex-1 items-center justify-center gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active ? "bg-navy text-white" : "text-ink/60 hover:bg-tint hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-none items-center gap-1">
          <form action={endSessionAction} className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-md bg-crimson px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-crimson-bright"
            >
              Log Out
            </button>
          </form>
        </div>
      </div>

    </header>
  );
}
