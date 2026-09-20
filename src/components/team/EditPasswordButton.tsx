"use client";

import { useRef, useState, useTransition } from "react";
import { setMemberPasswordAction } from "@/lib/admin/actions";

function EyeIcon({ crossed }: { crossed: boolean }) {
  return crossed ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 3l18 18" strokeLinecap="round" />
      <path
        d="M10.6 5.1A10.9 10.9 0 0112 5c5.5 0 9 4.6 10 7-.4.9-1.1 2-2.1 3.1M6.3 6.4C4.5 7.7 3.1 9.6 2 12c1 2.4 4.5 7 10 7 1.4 0 2.7-.3 3.8-.8M9.5 9.9a3 3 0 004.2 4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12c1-2.4 4.5-7 10-7s9 4.6 10 7c-1 2.4-4.5 7-10 7s-9-4.6-10-7z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * Real passwords are hashed by Supabase Auth and can never be shown — this
 * masks a fixed placeholder and lets a Team Lead type a brand-new one
 * (with its own show/hide toggle on the value they're typing).
 */
export default function EditPasswordButton({ userId, name }: { userId: string; name: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    setValue("");
    setVisible(false);
    setError(null);
    dialogRef.current?.showModal();
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setMemberPasswordAction(userId, value);
      if (result.error) setError(result.error);
      else dialogRef.current?.close();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={`Reset ${name}'s password`}
        className="text-xs font-medium text-navy/70 hover:text-navy hover:underline"
      >
        Reset password
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-xs rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h3 className="font-display text-base font-bold text-ink">New password for {name}</h3>
        <p className="mt-1 text-xs text-ink/50">
          They&rsquo;ll be asked to confirm it on their next login.
        </p>
        <div className="relative mt-3">
          <input
            type={visible ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="8+ characters"
            autoFocus
            className="w-full rounded-md border border-hairline-strong px-3 py-2 pr-10 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink/40 hover:text-ink/70"
          >
            <EyeIcon crossed={visible} />
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-crimson">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-ink/60 hover:bg-tint"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </dialog>
    </>
  );
}
