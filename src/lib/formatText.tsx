import type { ReactNode } from "react";

// Deliberately not HTML — this is user-authored text stored as plain
// strings, matched against a small fixed markup and turned directly into
// React elements below. No dangerouslySetInnerHTML anywhere, so there's no
// stored-XSS surface no matter what a member types in.
const FORMAT_PATTERN = /\*\*(.+?)\*\*|__(.+?)__|_(.+?)_/g;

/** Turns `**bold**` / `__underline__` / `_italic_` into React elements. Line breaks are handled separately by rendering with `whitespace-pre-wrap`, not here. */
export function renderFormattedText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  FORMAT_PATTERN.lastIndex = 0;
  while ((match = FORMAT_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    if (match[1] !== undefined) nodes.push(<strong key={key++}>{match[1]}</strong>);
    else if (match[2] !== undefined) nodes.push(<u key={key++}>{match[2]}</u>);
    else if (match[3] !== undefined) nodes.push(<em key={key++}>{match[3]}</em>);

    lastIndex = FORMAT_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));

  return nodes;
}

/** Renders stored description/info text with its bold/italic/underline markup applied and line breaks preserved. */
export default function FormattedText({
  text,
  className = "",
}: {
  text: string | null | undefined;
  className?: string;
}) {
  if (!text) return null;
  return <div className={`whitespace-pre-wrap ${className}`}>{renderFormattedText(text)}</div>;
}
