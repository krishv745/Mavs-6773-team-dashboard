"use client";

import { useId, useState } from "react";

export default function PasswordField({
  name,
  label,
  autoComplete,
}: {
  name: string;
  label: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-ink/80">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          autoComplete={autoComplete}
          className="w-full rounded-md border border-hairline-strong bg-surface px-3 py-2.5 pr-10 text-sm text-ink outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink/40 transition hover:text-ink/70"
        >
          {visible ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 3l18 18" strokeLinecap="round" />
              <path
                d="M10.6 5.1A10.9 10.9 0 0112 5c5.5 0 9 4.6 10 7-.4.9-1.1 2-2.1 3.1M6.3 6.4C4.5 7.7 3.1 9.6 2 12c1 2.4 4.5 7 10 7 1.4 0 2.7-.3 3.8-.8M9.5 9.9a3 3 0 004.2 4.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2 12c1-2.4 4.5-7 10-7s9 4.6 10 7c-1 2.4-4.5 7-10 7s-9-4.6-10-7z" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
