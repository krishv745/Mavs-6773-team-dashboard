"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center rounded-md bg-crimson px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-crimson-bright disabled:opacity-60"
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}
