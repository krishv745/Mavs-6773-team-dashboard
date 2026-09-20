"use client";

import { useTeamTheme } from "@/components/team/ThemeProvider";

const OPTIONS = [
  { value: "light" as const, label: "Light", icon: "☀️" },
  { value: "dark" as const, label: "Dark", icon: "🌙" },
  { value: "system" as const, label: "System", icon: "🖥️" },
];

/** Cycles light → dark → system → light. */
export default function ThemeToggle() {
  const { theme, setTheme } = useTeamTheme();
  const index = OPTIONS.findIndex((o) => o.value === theme);
  const current = OPTIONS[index] ?? OPTIONS[2];

  function cycle() {
    const next = OPTIONS[(index + 1) % OPTIONS.length];
    setTheme(next.value);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${current.label} (click to change)`}
      aria-label={`Theme: ${current.label}. Click to change.`}
      className="flex flex-none items-center gap-1.5 rounded-md px-2 py-1 transition hover:bg-hairline"
    >
      <span className="text-base leading-none">{current.icon}</span>
      <span className="text-xs font-medium text-ink/60">{current.label}</span>
    </button>
  );
}
