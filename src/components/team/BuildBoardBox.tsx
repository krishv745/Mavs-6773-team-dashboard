import type { ReactNode } from "react";

/** One titled panel in the 2×2 build board grid (project + subsystem dashboards). */
export default function BuildBoardBox({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-[220px] flex-col rounded-xl border border-hairline-strong bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink">
          {title}
          {typeof count === "number" && <span className="ml-1.5 font-sans text-ink/40">({count})</span>}
        </h2>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export function BoardEmpty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink/40">{children}</p>;
}
