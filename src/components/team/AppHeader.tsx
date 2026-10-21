"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { endSessionAction } from "@/lib/auth/actions";
import { addSessionLogAction } from "@/lib/sessionLog/actions";
import Avatar from "@/components/team/Avatar";
import ClockHeartbeat from "@/components/team/ClockHeartbeat";
import NoteFields from "@/components/team/NoteFields";
import SubmitButton from "@/components/team/SubmitButton";
import ChatPanel from "@/components/team/ChatPanel";
import ThemeToggle from "@/components/team/ThemeToggle";
import { hasPermission } from "@/lib/permissions";
import type { Profile } from "@/lib/auth/session";

const MEMBER_TABS = [
  { href: "/team/projects", label: "Projects" },
  { href: "/team/events", label: "Events" },
  { href: "/team/build", label: "Build" },
  { href: "/team/log", label: "Clock Log" },
];

const PARENT_TABS = [{ href: "/team/events", label: "Events" }];

function elapsed(clockInAt: string) {
  const ms = Date.now() - new Date(clockInAt).getTime();
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function AppHeader({
  profile,
  clockInAt,
  hasLoggedThisSession,
}: {
  profile: Profile;
  clockInAt: string | null;
  hasLoggedThisSession: boolean;
}) {
  const pathname = usePathname();
  const [, forceTick] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(addSessionLogAction, undefined);

  useEffect(() => {
    if (!clockInAt) return;
    const id = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [clockInAt]);

  const label = clockInAt ? elapsed(clockInAt) : null;

  const isParent = profile.role === "parent";
  const canSeeAdmin =
    hasPermission(profile, "approve_tasks") ||
    hasPermission(profile, "view_admin_hours") ||
    hasPermission(profile, "manage_members") ||
    hasPermission(profile, "manage_roles") ||
    hasPermission(profile, "manage_events");
  const tabs = isParent
    ? PARENT_TABS
    : canSeeAdmin
      ? [...MEMBER_TABS, { href: "/team/admin", label: "Admin" }]
      : MEMBER_TABS;

  const homeHref = isParent ? "/team/events" : "/team/projects";

  function handleClockOutClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!clockInAt || isParent || hasLoggedThisSession) return;
    e.preventDefault();
    dialogRef.current?.showModal();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface">
      {clockInAt && <ClockHeartbeat />}
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link href={homeHref} className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Max Throttle Mavericks 6773" width={32} height={32} />
            <span className="hidden font-display text-base font-bold text-navy sm:inline">
              MAX THROTTLE MAVERICKS
            </span>
          </Link>
          <ThemeToggle />
          <Link href="/team/profile" title="Your profile" className="flex-none">
            <Avatar name={profile.name} avatarUrl={profile.avatar_url} size="xs" />
          </Link>
          {!isParent && <ChatPanel />}
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
            {label && (
              <span className="hidden text-xs font-medium text-ink/50 sm:inline">
                Clocked in · {label}
              </span>
            )}
            <button
              type="submit"
              onClick={handleClockOutClick}
              className="rounded-md bg-crimson px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-crimson-bright"
            >
              {label ? "Clock Out" : "Log Out"}
            </button>
          </form>
        </div>
      </div>

      {!isParent && (
        <dialog
          ref={dialogRef}
          className="w-full max-w-md rounded-xl p-0 backdrop:bg-black/40"
          onClick={(e) => {
            if (e.target === dialogRef.current) dialogRef.current?.close();
          }}
        >
          <div className="p-6">
            <h2 className="font-display text-xl font-bold text-ink">Before you clock out</h2>
            <p className="mt-1 text-sm text-ink/60">
              You haven&rsquo;t logged anything on a task this session — what did you work on?
            </p>

            <form action={formAction} className="mt-5 space-y-4">
              <input type="hidden" name="thenClockOut" value="true" />
              <NoteFields label="What did you work on?" />

              {state?.error && (
                <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <SubmitButton>Submit &amp; clock out</SubmitButton>
                <button
                  type="submit"
                  formAction={endSessionAction}
                  className="flex-1 rounded-md border border-hairline-strong px-4 py-2.5 text-sm font-semibold text-ink/60 transition hover:bg-tint"
                >
                  Skip &amp; clock out
                </button>
              </div>
            </form>

            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="mt-3 text-xs font-medium text-ink/40 hover:underline"
            >
              Never mind, keep working
            </button>
          </div>
        </dialog>
      )}
    </header>
  );
}
