import Link from "next/link";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import AddEventModal from "@/components/team/AddEventModal";
import EventCalendar from "@/components/team/EventCalendar";
import EventCategoryFilter from "@/components/team/EventCategoryFilter";
import ViewToggle from "@/components/team/ViewToggle";
import { formatEventTimeRange } from "@/lib/events/format";
import { categoryColor } from "@/lib/events/categoryColors";
import { formatCalendarDate } from "@/lib/formatTime";
import DeleteEventButton from "@/components/team/DeleteEventButton";
import type { EventRow } from "@/lib/supabase/types";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; category?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "list" ? "list" : "calendar";

  const [profile, supabase] = await Promise.all([getCurrentProfile(), createServerClient()]);
  const canManageEvents = hasPermission(profile, "manage_events");
  const canDeleteEvents = hasPermission(profile, "delete_events");
  const seesAllEvents = canManageEvents || canDeleteEvents;

  let query = supabase.from("events").select("*").order("date", { ascending: true });
  if (params.category) query = query.eq("category_id", params.category);
  const [{ data: rawEvents }, { data: categories }, { data: roles }, { data: volunteerRows }] =
    await Promise.all([
      query,
      supabase.from("event_categories").select("*").order("name", { ascending: true }),
      supabase.from("event_roles").select("event_id, slots_needed"),
      supabase.from("event_volunteers").select("event_id").eq("status", "confirmed"),
    ]);

  // Anyone who manages or deletes events always sees everything; everyone
  // else only sees events whose visible_to list includes their role (or
  // events visible to all).
  const events: EventRow[] = seesAllEvents
    ? rawEvents ?? []
    : (rawEvents ?? []).filter((e) => !e.visible_to || e.visible_to.length === 0 || e.visible_to.includes(profile!.role));

  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const neededByEvent = new Map<string, number>();
  for (const r of roles ?? []) {
    neededByEvent.set(r.event_id, (neededByEvent.get(r.event_id) ?? 0) + r.slots_needed);
  }
  const filledByEvent = new Map<string, number>();
  for (const v of volunteerRows ?? []) {
    filledByEvent.set(v.event_id, (filledByEvent.get(v.event_id) ?? 0) + 1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.date >= today);
  const past = events.filter((e) => e.date < today);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Events</h1>
          <p className="mt-1 text-sm text-ink/60">{upcoming.length} upcoming</p>
        </div>
        {canManageEvents && <AddEventModal categories={categories ?? []} />}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <EventCategoryFilter categories={categories ?? []} />
        <ViewToggle />
      </div>

      {(categories ?? []).length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {(categories ?? []).map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 text-xs text-ink/50">
              <span className={`h-2 w-2 rounded-full ${categoryColor(c.id).dot}`} />
              {c.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-6">
        {view === "calendar" ? (
          <EventCalendar events={events} today={today} />
        ) : events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline-strong bg-surface/60 p-10 text-center text-sm text-ink/50">
            No events yet.
          </div>
        ) : (
          <div className="space-y-8">
            {[
              { label: "Upcoming", items: upcoming },
              { label: "Past", items: past },
            ]
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <div key={group.label}>
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-ink/40">
                    {group.label}
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {group.items.map((event) => {
                      const needed = neededByEvent.get(event.id) ?? 0;
                      const filled = filledByEvent.get(event.id) ?? 0;
                      return (
                        <li key={event.id}>
                          <Link
                            href={`/team/events/${event.id}`}
                            className="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-surface p-4 transition hover:border-navy/20 hover:shadow-sm"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-ink">{event.name}</p>
                                {event.category_id && categoryName.get(event.category_id) && (
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${categoryColor(event.category_id).badge}`}
                                  >
                                    {categoryName.get(event.category_id)}
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-ink/50">
                                {formatCalendarDate(event.date, {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                  year: undefined,
                                })}
                                {formatEventTimeRange(event.start_time, event.end_time)}
                              </p>
                            </div>
                            <div className="flex flex-none items-center gap-2">
                              <p className="text-xs text-ink/50">
                                {needed === 0 ? "No roles set" : `${filled}/${needed} volunteers`}
                              </p>
                              {canDeleteEvents && <DeleteEventButton eventId={event.id} eventName={event.name} />}
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
