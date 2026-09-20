"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { updateThemeAction } from "@/lib/theme/actions";
import type { ThemePreference } from "@/lib/supabase/types";

type Theme = ThemePreference;
type ThemeContextValue = { theme: Theme; resolvedDark: boolean; setTheme: (next: Theme) => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Wraps the signed-in team app (never the public marketing site) in a `.dark`
 * scope that the whole app's theme tokens key off of — see globals.css.
 *
 * The chosen theme (light / dark / follow system) lives on the member's
 * account row, not just this browser, so it follows them to any device they
 * sign in on — `initialTheme` is that saved value, read server-side in the
 * layout so the very first paint already matches instead of flashing light
 * then swapping to dark. Every change is pushed back to the account via
 * updateThemeAction.
 */
export default function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  // "light"/"dark" are already known from the server-provided initialTheme,
  // so those paint correctly on the very first render. "system" can't be
  // resolved until the client can read matchMedia — it starts false (server
  // and first client render agree, no hydration mismatch) and flips to the
  // real value in the layout effect below, before the browser paints.
  const [resolvedDark, setResolvedDark] = useState(initialTheme === "dark");

  useLayoutEffect(() => {
    if (initialTheme !== "system") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolvedDark(systemPrefersDark());
    // Only ever needs to run once, against the theme the server sent down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolvedDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function setTheme(next: Theme) {
    setThemeState(next);
    setResolvedDark(next === "dark" || (next === "system" && systemPrefersDark()));
    void updateThemeAction(next).catch(() => {
      // Best-effort — the UI has already switched locally either way; worst
      // case the choice just doesn't follow to another device this time.
    });
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedDark, setTheme }}>
      {/* `text-ink` here (not just on individual elements) matters: this div
          sits below <body>, and .dark only overrides CSS custom properties,
          not `color` itself — so anything that relies on inheriting its text
          color rather than setting an explicit text-* class (unstyled
          <input>/<textarea> in particular) would otherwise inherit the
          `color` <body> resolved *before* .dark ever applies and stay stuck
          on the light-mode ink color forever. Setting it explicitly here
          restarts inheritance from the right value for every descendant. */}
      <div
        className={
          resolvedDark ? "dark min-h-screen bg-tint text-ink" : "min-h-screen bg-tint text-ink"
        }
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTeamTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTeamTheme must be used inside ThemeProvider.");
  return ctx;
}
