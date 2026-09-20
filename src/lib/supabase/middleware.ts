import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/supabase/types";

// Redirected away from if the visitor is already logged in.
const PUBLIC_AUTH_PATHS = ["/team/login"];
// Always reachable, logged in or not — recovery-link tokens for
// /team/reset-password arrive only in the URL hash, which never reaches the
// server, so we can't tell here whether a recovery session is about to be
// established client-side. Never redirect these away.
const PASSWORD_RECOVERY_PATHS = ["/team/forgot-password", "/team/reset-password"];

// No request in this long while a session is still open — treat the tab as
// closed and clock out immediately, rather than waiting for the nightly
// cron. Comfortably longer than a normal gap between page loads/actions, so
// someone reading a long page doesn't get treated as gone.
const ABANDONED_SESSION_MINUTES = 15;
// Don't bother writing a heartbeat on literally every request — once a
// minute is plenty to keep a session looking "alive".
const HEARTBEAT_REFRESH_MINUTES = 1;

// Cache of `users.role` / `must_reset_password`, read on every request for
// routing decisions (auth redirects, the parent-only path allowlist). This
// is NOT the security boundary — every server action and page re-checks the
// role fresh against the DB via getCurrentProfile() before doing anything
// sensitive — so a short client-visible cache here only risks a stale
// redirect for a few minutes, never a permission bypass.
const ROLE_CACHE_COOKIE = "tt_role_cache";
const ROLE_CACHE_MINUTES = 20;
type RoleCache = { role: UserRole | null; mustResetPassword: boolean; ts: number };

// Throttles the abandoned-session / catch-up-pending checks below so a
// burst of navigations in the same minute only hits the DB once.
const SESSION_CHECK_COOKIE = "tt_session_checked_at";

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/team",
    maxAge: maxAgeSeconds,
  };
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPath = PUBLIC_AUTH_PATHS.some((p) => path.startsWith(p));
  const isRecoveryPath = PASSWORD_RECOVERY_PATHS.some((p) => path.startsWith(p));

  if (!user && !isAuthPath && !isRecoveryPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/team/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const now = Date.now();

    let role: UserRole | null = null;
    let mustResetPassword = false;
    let cacheIsFresh = false;

    const roleCacheRaw = request.cookies.get(ROLE_CACHE_COOKIE)?.value;
    if (roleCacheRaw) {
      try {
        const cached = JSON.parse(roleCacheRaw) as RoleCache;
        if (now - cached.ts < ROLE_CACHE_MINUTES * 60_000) {
          role = cached.role;
          mustResetPassword = cached.mustResetPassword;
          cacheIsFresh = true;
        }
      } catch {
        // Malformed/tampered cookie — fall through to a fresh DB fetch.
      }
    }

    const lastCheckedAt = Number(request.cookies.get(SESSION_CHECK_COOKIE)?.value ?? 0);
    const sessionCheckDue = now - lastCheckedAt >= HEARTBEAT_REFRESH_MINUTES * 60_000;
    const catchUpLogPath = path === "/team/catch-up-log";

    // The profile lookup, the open-session lookup, and the pending-catch-up
    // lookup are all independent of each other — run them together instead
    // of one blocking round-trip after another. Each is skipped entirely
    // when a cache/throttle above already covers it.
    const [profileResult, openSessionResult, pendingSessionResult] = await Promise.all([
      cacheIsFresh
        ? Promise.resolve(null)
        : supabase.from("users").select("role, must_reset_password").eq("id", user.id).single(),
      sessionCheckDue
        ? supabase
            .from("clock_sessions")
            .select("id, last_seen_at")
            .eq("user_id", user.id)
            .is("clock_out", null)
            .maybeSingle()
        : Promise.resolve(null),
      sessionCheckDue && !catchUpLogPath
        ? supabase
            .from("clock_sessions")
            .select("id")
            .eq("user_id", user.id)
            .eq("auto_clocked_out", true)
            .eq("catch_up_resolved", false)
            .limit(1)
            .maybeSingle()
        : Promise.resolve(null),
    ]);

    if (profileResult) {
      role = profileResult.data?.role ?? null;
      mustResetPassword = profileResult.data?.must_reset_password ?? false;
      supabaseResponse.cookies.set(
        ROLE_CACHE_COOKIE,
        JSON.stringify({ role, mustResetPassword, ts: now } satisfies RoleCache),
        cookieOptions(ROLE_CACHE_MINUTES * 60),
      );
    }

    const homePath = role === "parent" ? "/team/events" : "/team/projects";

    if (isAuthPath) {
      const url = request.nextUrl.clone();
      url.pathname = homePath;
      return NextResponse.redirect(url);
    }

    if (path !== "/team/reset-password" && mustResetPassword) {
      const url = request.nextUrl.clone();
      url.pathname = "/team/reset-password";
      return NextResponse.redirect(url);
    }

    if (sessionCheckDue) {
      supabaseResponse.cookies.set(SESSION_CHECK_COOKIE, String(now), cookieOptions(HEARTBEAT_REFRESH_MINUTES * 60));

      // Notice a session gone stale (no request in a while — the tab was
      // almost certainly closed) and close it out right now, so the very
      // next check below picks it up immediately instead of waiting for the
      // nightly cron. Otherwise just refresh the heartbeat.
      const openSession = openSessionResult?.data;
      if (openSession) {
        const minutesSinceSeen = (now - new Date(openSession.last_seen_at).getTime()) / 60000;
        const admin = createAdminClient();

        if (minutesSinceSeen > ABANDONED_SESSION_MINUTES) {
          await admin
            .from("clock_sessions")
            .update({ clock_out: new Date().toISOString(), auto_clocked_out: true })
            .eq("id", openSession.id);
        } else if (minutesSinceSeen > HEARTBEAT_REFRESH_MINUTES) {
          await admin
            .from("clock_sessions")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", openSession.id);
        }
      }

      // A session that got force-closed (tab closed without clocking
      // out) with nothing logged against it yet — ask what they worked on
      // before they can go anywhere else, same gating pattern as the forced
      // password reset above.
      if (!catchUpLogPath) {
        const pendingSession = pendingSessionResult?.data;
        if (pendingSession) {
          const url = request.nextUrl.clone();
          url.pathname = "/team/catch-up-log";
          return NextResponse.redirect(url);
        }
      }
    }

    // Parent accounts only ever see the Events tab (plus their own profile).
    const parentAllowedPaths = ["/team/events", "/team/profile", "/team/reset-password"];
    if (role === "parent" && !parentAllowedPaths.some((p) => path.startsWith(p))) {
      const url = request.nextUrl.clone();
      url.pathname = "/team/events";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
