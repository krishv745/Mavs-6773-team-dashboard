import type { ReactNode } from "react";
import { formatCalendarDate } from "@/lib/formatTime";
import { taskDuePercent, daysUntil } from "@/lib/timeline";

/** The Projects board's Timeline column — a per-task progress bar from creation to due date, with the date shown (or an editable slot). */
export default function TaskDueTimeline({
  createdAt,
  deadline,
  completed,
  ongoing = false,
  dateSlot,
  className = "w-40",
}: {
  createdAt: string;
  deadline: string | null;
  completed: boolean;
  ongoing?: boolean;
  /** Rendered in place of the plain date label — e.g. an inline date editor. */
  dateSlot?: ReactNode;
  className?: string;
}) {
  if (ongoing) {
    return (
      <div className={className}>
        <div className="h-1.5 w-full rounded-full bg-[repeating-linear-gradient(45deg,var(--color-tint-deep)_0_6px,transparent_6px_12px)]" />
        <div className="mt-1 flex items-center justify-between gap-1 text-[11px]">
          <span className="flex-none text-ink/50">Ongoing</span>
          <span className="min-w-0 truncate text-right text-ink/40">{dateSlot ?? "no end date"}</span>
        </div>
      </div>
    );
  }

  if (!deadline) {
    return <div className={className}>{dateSlot ?? <span className="text-xs text-ink/30">No due date</span>}</div>;
  }

  const days = daysUntil(deadline);
  const overdue = !completed && days < 0;
  const pct = completed ? 100 : taskDuePercent(createdAt, deadline);
  const barColor = completed ? "bg-emerald-500" : overdue ? "bg-crimson" : "bg-navy";
  const label = completed
    ? "done"
    : overdue
      ? `${Math.abs(days)}d over`
      : days === 0
        ? "today"
        : `${days}d left`;

  return (
    <div className={className}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-tint">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-1 text-[11px]">
        <span className={`flex-none ${overdue ? "font-semibold text-crimson" : "text-ink/50"}`}>{label}</span>
        <span className="min-w-0 truncate text-right text-ink/40">
          {dateSlot ?? formatCalendarDate(deadline, { month: "short", day: "numeric" })}
        </span>
      </div>
    </div>
  );
}
