"use client";

import { useId, useRef, useState } from "react";

/**
 * Textarea with Bold/Italic/Underline buttons that wrap the current
 * selection in a small custom markup (**bold**, _italic_, __underline__) —
 * not HTML, so there's nothing to sanitize and no XSS surface. Rendered
 * back out via `renderFormattedText` / `<FormattedText>` in lib/formatText.
 */
export default function RichTextField({
  name,
  label,
  defaultValue = "",
  rows = 3,
  placeholder,
}: {
  name: string;
  label?: string;
  defaultValue?: string;
  rows?: number;
  placeholder?: string;
}) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(defaultValue);

  function wrapSelection(prefix: string, suffix: string = prefix) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
    setValue(next);

    requestAnimationFrame(() => {
      el.focus();
      const cursorStart = start + prefix.length;
      el.setSelectionRange(cursorStart, cursorStart + selected.length);
    });
  }

  return (
    <div>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink/80">
          {label}
        </label>
      )}
      <div className="mt-1.5 overflow-hidden rounded-md border border-hairline-strong focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/10">
        <div className="flex items-center gap-1 border-b border-hairline-strong bg-tint/60 px-2 py-1">
          <button
            type="button"
            onClick={() => wrapSelection("**")}
            aria-label="Bold"
            title="Bold"
            className="rounded px-2 py-1 text-xs font-bold text-ink/70 hover:bg-hairline"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => wrapSelection("_")}
            aria-label="Italic"
            title="Italic"
            className="rounded px-2 py-1 text-xs italic text-ink/70 hover:bg-hairline"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => wrapSelection("__")}
            aria-label="Underline"
            title="Underline"
            className="rounded px-2 py-1 text-xs font-semibold text-ink/70 underline hover:bg-hairline"
          >
            U
          </button>
        </div>
        <textarea
          ref={textareaRef}
          id={id}
          name={name}
          rows={rows}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full resize-y px-3 py-2.5 text-sm text-ink outline-none"
        />
      </div>
    </div>
  );
}
