"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { categoryColor } from "@/lib/events/categoryColors";
import type { EventRow } from "@/lib/supabase/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function EventCalendar({ events, today }: { events: EventRow[]; today: string }) {
  const initial = new Date(today);
  const [cursor, setCursor] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));

  const byDate = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const event of events) {
      if (!map.has(event.date)) map.set(event.date, []);
      map.get(event.date)!.push(event);
    }
    return map;
  }, [events]);

  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-ink">
          {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
        </h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="rounded-md px-2.5 py-1 text-sm text-ink/60 hover:bg-tint"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="rounded-md px-2.5 py-1 text-sm text-ink/60 hover:bg-tint"
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink/40">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          const key = date ? toDateKey(date) : `blank-${i}`;
          const dayEvents = date ? byDate.get(toDateKey(date)) ?? [] : [];
          const isToday = date ? toDateKey(date) === today : false;

          return (
            <div
              key={key}
              className={`min-h-[84px] rounded-md border p-1.5 text-left align-top ${
                date ? "border-hairline" : "border-transparent"
              } ${isToday ? "bg-crimson/5 ring-1 ring-crimson/30" : "bg-tint/40"}`}
            >
              {date && (
                <>
                  <p className="text-[11px] font-semibold text-ink/50">{date.getDate()}</p>
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <Link
                        key={ev.id}
                        href={`/team/events/${ev.id}`}
                        className={`block truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${categoryColor(ev.category_id).badge}`}
                        title={ev.name}
                      >
                        {ev.name}
                      </Link>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-[10px] text-ink/40">+{dayEvents.length - 3} more</p>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
