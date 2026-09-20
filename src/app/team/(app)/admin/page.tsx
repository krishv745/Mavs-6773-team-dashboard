import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { approveTaskAction, rejectTaskAction } from "@/lib/tasks/actions";
import { subteamLabel } from "@/lib/subteams";
import { WEEKLY_MINIMUM_MINUTES, startOfWeek, sessionMinutes } from "@/lib/hours";
import AddMemberModal from "@/components/team/AddMemberModal";
import MemberHoursTable, { type MemberRow } from "@/components/team/MemberHoursTable";
import RolesPanel from "@/components/team/RolesPanel";

export default async function AdminDashboardPage() {
  const profile = await getCurrentProfile();
  const canApproveTasks = hasPermission(profile, "approve_tasks");
  const canViewHours = hasPermission(profile, "view_admin_hours");
  const canManageMembers = hasPermission(profile, "manage_members");
  const canManageRoles = hasPermission(profile, "manage_roles");
  const canManageEvents = hasPermission(profile, "manage_events");
  if (!canApproveTasks && !canViewHours && !canManageMembers && !canManageRoles && !canManageEvents) {
    redirect("/team/projects");
  }

  const supabase = await createServerClient();
  const weekStart = startOfWeek(new Date()).toISOString();

  const [
    { data: pendingTasks },
    { data: users },
    { data: weekSessions },
    { data: allSessions },
    { data: volunteers },
    { data: customRoles },
    { data: rolePermissionRows },
  ] = await Promise.all([
    supabase.from("tasks").select("*").eq("status", "pending").order("created_at", { ascending: false }),
    supabase.from("users").select("*").order("name", { ascending: true }),
    supabase.from("clock_sessions").select("user_id, clock_in, clock_out").gte("clock_in", weekStart),
    supabase.from("clock_sessions").select("user_id, clock_in, clock_out"),
    supabase
      .from("event_volunteers")
      .select("id, name, email, role_id, event_id, status, cancel_reason")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("roles").select("*").order("name", { ascending: true }),
    supabase.from("role_permissions").select("role_id, permission_key"),
  ]);

  const permissionsByRole: Record<string, string[]> = {};
  for (const rp of rolePermissionRows ?? []) {
    const list = permissionsByRole[rp.role_id] ?? [];
    list.push(rp.permission_key);
    permissionsByRole[rp.role_id] = list;
  }

  const volunteerEventIds = [...new Set((volunteers ?? []).map((v) => v.event_id))];
  const { data: volunteerEvents } = volunteerEventIds.length
    ? await supabase.from("events").select("id, name").in("id", volunteerEventIds)
    : { data: [] };
  const eventNameById = new Map((volunteerEvents ?? []).map((e) => [e.id, e.name]));

  const volunteerRoleIds = [
    ...new Set((volunteers ?? []).map((v) => v.role_id).filter((id): id is string => Boolean(id))),
  ];
  const { data: volunteerRoles } = volunteerRoleIds.length
    ? await supabase.from("event_roles").select("id, name").in("id", volunteerRoleIds)
    : { data: [] };
  const roleNameById = new Map((volunteerRoles ?? []).map((r) => [r.id, r.name]));

  const creatorIds = [...new Set((pendingTasks ?? []).map((t) => t.created_by).filter((id): id is string => Boolean(id)))];
  const { data: creators } = creatorIds.length
    ? await supabase.from("users").select("id, name").in("id", creatorIds)
    : { data: [] };
  const creatorMap = new Map((creators ?? []).map((c) => [c.id, c.name]));

  const pendingProjectIds = [
    ...new Set((pendingTasks ?? []).map((t) => t.project_id).filter((id): id is string => Boolean(id))),
  ];
  const { data: pendingProjects } = pendingProjectIds.length
    ? await supabase.from("task_projects").select("id, name").in("id", pendingProjectIds)
    : { data: [] };
  const pendingProjectName = new Map((pendingProjects ?? []).map((p) => [p.id, p.name]));

  // eslint-disable-next-line react-hooks/purity -- server-rendered timestamp for an open session, not a memoized value
  const now = Date.now();
  const minutesByUser = new Map<string, number>();
  for (const s of weekSessions ?? []) {
    const minutes = sessionMinutes(s.clock_in, s.clock_out, now);
    minutesByUser.set(s.user_id, (minutesByUser.get(s.user_id) ?? 0) + minutes);
  }
  const allTimeMinutesByUser = new Map<string, number>();
  for (const s of allSessions ?? []) {
    const minutes = sessionMinutes(s.clock_in, s.clock_out, now);
    allTimeMinutesByUser.set(s.user_id, (allTimeMinutesByUser.get(s.user_id) ?? 0) + minutes);
  }

  // Email lives on auth.users, not public.users — needs the service-role client.
  const admin = createAdminClient();
  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map(authUsers?.users.map((u) => [u.id, u.email ?? ""]) ?? []);

  const memberRows: MemberRow[] = (users ?? []).map((u) => {
    const minutes = minutesByUser.get(u.id) ?? 0;
    return {
      id: u.id,
      name: u.name,
      username: u.username,
      email: emailById.get(u.id) ?? "",
      phone: u.phone ?? "",
      role: u.role,
      roleId: u.role_id,
      hoursThisWeek: (minutes / 60).toFixed(1),
      allTimeHours: ((allTimeMinutesByUser.get(u.id) ?? 0) / 60).toFixed(1),
      flagged: minutes < WEEKLY_MINIMUM_MINUTES,
    };
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-ink">Admin Dashboard</h1>
        <Link
          href="/team/admin/reports"
          className="rounded-md border border-hairline-strong bg-surface px-4 py-2 text-sm font-semibold text-ink/70 hover:bg-tint"
        >
          Activity Report →
        </Link>
      </div>

      {/* Pending approvals */}
      {canApproveTasks && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-ink/40">
            Pending task approvals ({(pendingTasks ?? []).length})
          </h2>
          {(pendingTasks ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-ink/50">Nothing waiting on you.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(pendingTasks ?? []).map((task) => (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-4"
                >
                  <div>
                    <p className="font-medium text-ink">{task.title}</p>
                    <p className="text-xs text-ink/50">
                      {(task.project_id && pendingProjectName.get(task.project_id)) ?? "No project"} ·{" "}
                      {subteamLabel(task.subteam)} · submitted by{" "}
                      {(task.created_by && creatorMap.get(task.created_by)) ?? "a member"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action={approveTaskAction.bind(null, task.id)}>
                      <button className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy/90">
                        Approve
                      </button>
                    </form>
                    <form action={rejectTaskAction.bind(null, task.id)}>
                      <button className="rounded-md border border-hairline-strong px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-tint">
                        Reject
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Hour tracking */}
      {canViewHours && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-ink/40">
            This week&rsquo;s hours · 6h/week minimum
          </h2>
          <div className="mt-3">
            <MemberHoursTable
              rows={memberRows}
              currentUserId={profile!.id}
              isOwner={profile?.role === "owner"}
              canManageMembers={canManageMembers}
              roles={customRoles ?? []}
            />
          </div>
        </section>
      )}

      {/* Members */}
      {canManageMembers && (
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-ink/40">Add a member</h2>
            <AddMemberModal canAssignTeamLead={profile?.role === "owner"} />
          </div>
        </section>
      )}

      {/* Roles & permissions */}
      {canManageRoles && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-ink/40">
            Roles &amp; permissions
          </h2>
          <RolesPanel
            roles={customRoles ?? []}
            permissionsByRole={permissionsByRole}
            isOwner={profile?.role === "owner"}
          />
        </section>
      )}

      {/* Volunteer sign-ups */}
      {canManageEvents && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-ink/40">
            Recent volunteer sign-ups
          </h2>
          {(volunteers ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-ink/50">No volunteer sign-ups yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(volunteers ?? []).map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-surface px-4 py-3 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-ink">{v.name}</span>
                    {v.status === "cancelled" && (
                      <span className="rounded-full bg-crimson/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-crimson">
                        Cancelled
                      </span>
                    )}
                  </span>
                  <span className="text-ink/50">{eventNameById.get(v.event_id) ?? "an event"}</span>
                  <span className="text-xs uppercase tracking-wide text-ink/40">
                    {(v.role_id && roleNameById.get(v.role_id)) ?? "—"}
                  </span>
                  {v.status === "cancelled" && v.cancel_reason && (
                    <span className="w-full text-xs italic text-ink/50">
                      Reason: {v.cancel_reason}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
