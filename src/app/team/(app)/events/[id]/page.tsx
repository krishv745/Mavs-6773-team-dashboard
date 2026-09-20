import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import VolunteerModal from "@/components/team/VolunteerModal";
import RemoveRegistrationModal from "@/components/team/RemoveRegistrationModal";
import StaffVolunteerControls from "@/components/team/StaffVolunteerControls";
import AssignVolunteerModal from "@/components/team/AssignVolunteerModal";
import EditEventModal from "@/components/team/EditEventModal";
import DeleteEventButton from "@/components/team/DeleteEventButton";
import { formatEventTimeRange } from "@/lib/events/format";
import { categoryColor } from "@/lib/events/categoryColors";
import { formatCalendarDate } from "@/lib/formatTime";
import FormattedText from "@/lib/formatText";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [profile, supabase] = await Promise.all([getCurrentProfile(), createServerClient()]);

  const { data: event } = await supabase.from("events").select("*").eq("id", id).single();
  if (!event) notFound();

  const canManageEvents = hasPermission(profile, "manage_events");
  const canDeleteEvents = hasPermission(profile, "delete_events");
  const seesAllEvents = canManageEvents || canDeleteEvents;
  const visible =
    seesAllEvents || !event.visible_to || event.visible_to.length === 0 || event.visible_to.includes(profile!.role);
  if (!visible) notFound();

  const [{ data: category }, { data: categories }, { data: futureSiblings }] = await Promise.all([
    event.category_id
      ? supabase.from("event_categories").select("name").eq("id", event.category_id).single()
      : Promise.resolve({ data: null }),
    canManageEvents ? supabase.from("event_categories").select("*").order("name", { ascending: true }) : Promise.resolve({ data: [] }),
    event.recurrence_group_id
      ? supabase
          .from("events")
          .select("id")
          .eq("recurrence_group_id", event.recurrence_group_id)
          .neq("id", event.id)
          .gt("date", event.date)
      : Promise.resolve({ data: [] }),
  ]);
  const hasFutureOccurrences = (futureSiblings ?? []).length > 0;

  const [{ data: roles }, { data: allVolunteers }, { data: members }] = await Promise.all([
    supabase.from("event_roles").select("*").eq("event_id", id).order("name", { ascending: true }),
    supabase.from("event_volunteers").select("*").eq("event_id", id).order("created_at", { ascending: true }),
    canManageEvents
      ? supabase.from("users").select("id, name, role").order("name", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const volunteers = (allVolunteers ?? []).filter((v) => v.status === "confirmed");

  const filledByRole = new Map<string, number>();
  for (const v of volunteers) {
    if (!v.role_id) continue;
    filledByRole.set(v.role_id, (filledByRole.get(v.role_id) ?? 0) + 1);
  }
  const roleName = new Map((roles ?? []).map((r) => [r.id, r.name]));

  const roleOptions = (roles ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    slotsNeeded: r.slots_needed,
    filled: filledByRole.get(r.id) ?? 0,
  }));

  const myRegistrations = profile
    ? volunteers
        .filter((v) => v.user_id === profile.id)
        .map((v) => ({ id: v.id, roleName: (v.role_id && roleName.get(v.role_id)) ?? "this event" }))
    : [];

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/team/events" className="text-sm font-medium text-ink/50 hover:text-ink">
        ← Back to events
      </Link>

      <div className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-ink">{event.name}</h1>
            {category?.name && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${categoryColor(event.category_id).badge}`}
              >
                {category.name}
              </span>
            )}
          </div>
          {(canManageEvents || canDeleteEvents) && (
            <div className="flex items-center gap-3">
              {canManageEvents && (
                <EditEventModal
                  eventId={event.id}
                  categories={categories ?? []}
                  hasFutureOccurrences={hasFutureOccurrences}
                  initial={{
                    name: event.name,
                    date: event.date,
                    startTime: event.start_time,
                    endTime: event.end_time,
                    info: event.info,
                    categoryId: event.category_id,
                    visibleTo: event.visible_to,
                  }}
                  roles={roleOptions.map((r) => ({ id: r.id, name: r.name, slotsNeeded: r.slotsNeeded }))}
                />
              )}
              {canDeleteEvents && (
                <DeleteEventButton eventId={event.id} eventName={event.name} label="Delete event" />
              )}
            </div>
          )}
        </div>
        <p className="mt-1 text-sm text-ink/60">
          {formatCalendarDate(event.date, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
          {formatEventTimeRange(event.start_time, event.end_time)}
        </p>
        <FormattedText text={event.info} className="mt-4 text-sm leading-relaxed text-ink/70" />
      </div>

      {roleOptions.length === 0 ? (
        <p className="mt-6 text-sm text-ink/50">No volunteer roles were set up for this event.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {roleOptions.map((role) => (
            <div key={role.id} className="rounded-xl border border-hairline bg-surface p-4 text-center">
              <p className="font-display text-2xl font-bold text-crimson">
                {role.filled}/{role.slotsNeeded}
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-ink/50">
                {role.name}
              </p>
            </div>
          ))}
        </div>
      )}

      {roleOptions.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <VolunteerModal eventId={event.id} roles={roleOptions} hasFutureOccurrences={hasFutureOccurrences} />
          <RemoveRegistrationModal registrations={myRegistrations} />
          {canManageEvents && (
            <AssignVolunteerModal
              eventId={event.id}
              roles={roleOptions.map((r) => ({ id: r.id, name: r.name }))}
              members={members ?? []}
              hasFutureOccurrences={hasFutureOccurrences}
            />
          )}
        </div>
      )}

      {volunteers.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-lg font-bold text-ink">Registered</h2>
          <ul className="mt-3 space-y-2">
            {volunteers.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-surface px-4 py-3 text-sm"
              >
                <span className="font-medium text-ink">{v.name}</span>
                {canManageEvents ? (
                  <StaffVolunteerControls
                    volunteerId={v.id}
                    roleId={v.role_id}
                    roles={roleOptions.map((r) => ({ id: r.id, name: r.name }))}
                  />
                ) : (
                  <span className="text-xs uppercase tracking-wide text-ink/40">
                    {(v.role_id && roleName.get(v.role_id)) ?? "—"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
