import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { UserRole } from "@/lib/supabase/types";
import { ROLE_CACHE_COOKIE } from "@/lib/auth/constants";

// Redirected away from if the visitor is already logged in.
const PUBLIC_AUTH_PATHS = ["/team/login"];
// Always reachable, logged in or not — recovery-link tokens for
// /team/reset-password arrive only in the URL hash, which never reaches the
// server, so we can't tell here whether a recovery session is about to be
// established client-side. Never redirect these away.
const PASSWORD_RECOVERY_PATHS = ["/team/forgot-password", "/team/reset-password"];

// Cache of `users.role` / `must_reset_password`, read on every request for
// routing decisions (auth redirects, the parent-only path allowlist). This
// is NOT the security boundary — every server action and page re-checks the
// role fresh against the DB via getCurrentProfile() before doing anything
// sensitive — so a short client-visible cache here only risks a stale
// redirect for a few minutes, never a permission bypass.
const ROLE_CACHE_MINUTES = 20;
type RoleCache = { role: UserRole | null; mustResetPassword: boolean; ts: number };

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

  // Server action calls (adding a log, changing a priority, …) POST to the
  // current page. A redirect here can't be followed by the action client —
  // it gets an HTML page back instead of an action result and the whole tab
  // crashes to "This page couldn't load". Every action re-checks auth
  // itself, so let them through; the redirects below apply on the very next
  // navigation instead.
  if (request.headers.has("next-action")) return supabaseResponse;

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

    if (!cacheIsFresh) {
      const { data } = await supabase.from("users").select("role, must_reset_password").eq("id", user.id).single();
      role = data?.role ?? null;
      mustResetPassword = data?.must_reset_password ?? false;
      supabaseResponse.cookies.set(
        ROLE_CACHE_COOKIE,
        JSON.stringify({ role, mustResetPassword, ts: now } satisfies RoleCache),
        cookieOptions(ROLE_CACHE_MINUTES * 60),
      );
    }

    const homePath = "/team/projects";

    if (isAuthPath) {
      const url = request.nextUrl.clone();
      url.pathname = homePath;
      // Land on the default view (By priority list), not whatever query the auth URL carried.
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (path !== "/team/reset-password" && mustResetPassword) {
      const url = request.nextUrl.clone();
      url.pathname = "/team/reset-password";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
