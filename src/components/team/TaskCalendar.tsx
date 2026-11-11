"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatCalendarDate } from "@/lib/formatTime";

export type CalendarItem = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  /** Label for the item, e.g. the stage ("Mechanical") or "Project deadline". */
  tag: string;
  /** Compact version of `tag` for calendar cells, e.g. "Mech". */
  shortTag: string;
  color: string;
  href: string;
  done: boolean;
  isProject?: boolean;
};

type Mode = "month" | "week";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function startOfWeek(d: Date) {
  return addDays(d, -d.getDay());
}

/**
 * Calendar of everything due on the Projects board: every task stage
 * deadline (in its project's color) plus each project's own deadline.
 * Month view lists every item in each day (cells grow to fit); week view
 * gives each day a full column. Click an item to jump to its task.
 */
export default function TaskCalendar({ items, today }: { items: CalendarItem[]; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Week/month lives in the URL (?cal=week) so it survives refreshes and links.
  const mode: Mode = searchParams.get("cal") === "week" ? "week" : "month";
  // The day the view is anchored on — month view shows its month, week view its week.
  const [anchor, setAnchor] = useState(() => fromKey(today));

  function changeMode(next: Mode) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "week") params.set("cal", "week");
    else params.delete("cal");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    // Project deadlines first, then open items before done ones.
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          Number(Boolean(b.isProject)) - Number(Boolean(a.isProject)) ||
          Number(a.done) - Number(b.done) ||
          a.title.localeCompare(b.title) ||
          a.tag.localeCompare(b.tag),
      );
    }
    return map;
  }, [items]);

  function shift(delta: number) {
    setAnchor((a) =>
      mode === "month" ? new Date(a.getFullYear(), a.getMonth() + delta, 1) : addDays(a, delta * 7),
    );
  }

  const weekStart = startOfWeek(anchor);
  const weekEnd = addDays(weekStart, 6);
  const heading =
    mode === "month"
      ? `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`
      : `${formatCalendarDate(toDateKey(weekStart), { month: "short", day: "numeric" })} – ${formatCalendarDate(
          toDateKey(weekEnd),
          { month: "short", day: "numeric", year: "numeric" },
        )}`;

  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-ink">{heading}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex rounded-md border border-hairline-strong bg-surface p-0.5 text-xs">
            {(["week", "month"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => changeMode(m)}
                aria-pressed={mode === m}
                className={`rounded px-2.5 py-1 font-medium capitalize transition ${
                  mode === m ? "bg-navy text-white" : "text-ink/60 hover:bg-tint"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAnchor(fromKey(today))}
            className="rounded-md border border-hairline-strong px-2.5 py-1 text-xs font-medium text-ink/60 hover:bg-tint"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label={mode === "month" ? "Previous month" : "Previous week"}
            className="rounded-md px-2.5 py-1 text-sm text-ink/60 hover:bg-tint"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label={mode === "month" ? "Next month" : "Next week"}
            className="rounded-md px-2.5 py-1 text-sm text-ink/60 hover:bg-tint"
          >
            →
          </button>
        </div>
      </div>

      {mode === "month" ? (
        <MonthGrid anchor={anchor} today={today} byDate={byDate} />
      ) : (
        <WeekColumns weekStart={weekStart} today={today} byDate={byDate} />
      )}
    </div>
  );
}

function MonthGrid({
  anchor,
  today,
  byDate,
}: {
  anchor: Date;
  today: string;
  byDate: Map<string, CalendarItem[]>;
}) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(first.getDay()).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(anchor.getFullYear(), anchor.getMonth(), i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink/40">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={`blank-${i}`} className="min-h-[96px]" />;
            const key = toDateKey(date);
            const dayItems = byDate.get(key) ?? [];
            const isToday = key === today;
            return (
              <div
                key={key}
                className={`flex min-h-[96px] min-w-0 flex-col rounded-md border p-1 ${
                  isToday ? "border-crimson/40 bg-crimson/5" : "border-hairline bg-tint/40"
                }`}
              >
                <span className={`text-[11px] font-semibold ${isToday ? "text-crimson" : "text-ink/50"}`}>
                  {date.getDate()}
                </span>
                <div className="mt-0.5 flex min-w-0 flex-col gap-0.5">
                  {dayItems.map((item) => (
                    <ItemChip key={item.id} item={item} compact />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekColumns({
  weekStart,
  today,
  byDate,
}: {
  weekStart: Date;
  today: string;
  byDate: Map<string, CalendarItem[]>;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-7 md:gap-1.5">
      {days.map((date) => {
        const key = toDateKey(date);
        const dayItems = byDate.get(key) ?? [];
        const isToday = key === today;
        return (
          <div
            key={key}
            className={`flex min-w-0 flex-col rounded-md border p-1.5 md:min-h-[320px] ${
              isToday ? "border-crimson/40 bg-crimson/5" : "border-hairline bg-tint/40"
            }`}
          >
            <div className="mb-1.5 flex items-baseline gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">
                {WEEKDAYS[date.getDay()]}
              </span>
              <span className={`text-sm font-bold ${isToday ? "text-crimson" : "text-ink/70"}`}>
                {date.getDate()}
              </span>
              {dayItems.length > 0 && (
                <span className="ml-auto text-[10px] font-medium text-ink/40">{dayItems.length}</span>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              {dayItems.length === 0 ? (
                <span className="text-[11px] text-ink/30">—</span>
              ) : (
                dayItems.map((item) => <ItemChip key={item.id} item={item} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ItemChip({ item, compact = false }: { item: CalendarItem; compact?: boolean }) {
  const style = item.isProject
    ? { backgroundColor: item.color }
    : { backgroundColor: `${item.color}22`, borderLeft: `3px solid ${item.color}` };
  return (
    <Link
      href={item.href}
      title={`${item.title} · ${item.tag}${item.done ? " (done)" : ""}`}
      style={style}
      className={`block rounded px-1 py-0.5 leading-tight break-words transition hover:brightness-95 ${
        compact ? "text-[10px]" : "text-xs"
      } ${item.isProject ? "font-semibold text-white" : "text-ink"} ${item.done ? "line-through opacity-50" : ""}`}
    >
      {item.isProject ? (
        <>🏁 {item.title}</>
      ) : (
        <>
          <span className="font-semibold opacity-70">{compact ? item.shortTag : item.tag}</span>{" "}
          <span className="font-medium">{item.title}</span>
        </>
      )}
    </Link>
  );
}
