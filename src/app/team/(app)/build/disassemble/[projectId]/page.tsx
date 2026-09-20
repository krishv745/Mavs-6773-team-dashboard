import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import { formatClockDateTime } from "@/lib/formatTime";
import { getDisassemblyProgress, type DisassemblyLineProgress } from "@/lib/disassembly/actions";
import StartDisassemblyButton from "@/components/team/StartDisassemblyButton";
import CompleteDisassemblyButton from "@/components/team/CompleteDisassemblyButton";
import ManualReturnButton from "@/components/team/ManualReturnButton";
import DisassemblyLineReturnButton from "@/components/team/DisassemblyLineReturnButton";
import MarkPartLostButton from "@/components/team/MarkPartLostButton";

type SortMode = "subsystem" | "location";

export default async function DisassemblePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { projectId } = await params;
  const { sort: sortParam } = await searchParams;
  const sort: SortMode = sortParam === "location" ? "location" : "subsystem";
  const [profile, supabase] = await Promise.all([getCurrentProfile(), createServerClient()]);
  const canManageParts = hasPermission(profile, "manage_parts");

  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!project) notFound();

  const { data: session } = await supabase
    .from("disassembly_sessions")
    .select("*")
    .eq("project_id", projectId)
    .is("completed_at", null)
    .maybeSingle();

  const { data: lastCompleted } = session
    ? { data: null }
    : await supabase
        .from("disassembly_sessions")
        .select("*")
        .eq("project_id", projectId)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  return (
    <div>
      <Link href={`/team/build/project/${projectId}`} className="text-sm font-medium text-ink/50 hover:text-ink">
        ← Back to {project.name}
      </Link>
      <h1 className="font-display mt-3 text-2xl font-bold text-ink">Disassemble {project.name}</h1>

      {!session ? (
        <div className="mt-6 max-w-md rounded-xl border border-hairline bg-surface p-6">
          <p className="text-sm text-ink/70">
            Pulls this project&rsquo;s current collected parts as the expected return list, then tracks what actually
            comes back as parts get marked returned.
          </p>
          {lastCompleted && (
            <p className="mt-3 rounded-md bg-tint/50 px-3 py-2 text-xs text-ink/60">
              Last session closed {formatClockDateTime(lastCompleted.completed_at!)}
              {lastCompleted.discrepancy_note && ` — note: "${lastCompleted.discrepancy_note}"`}
            </p>
          )}
          {canManageParts ? (
            <div className="mt-4">
              <StartDisassemblyButton projectId={projectId} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink/50">Only staff can start a disassembly session.</p>
          )}
        </div>
      ) : (
        <DisassemblyChecklist projectId={projectId} sessionId={session.id} canManageParts={canManageParts} sort={sort} />
      )}
    </div>
  );
}

/** Fallback bucket label shown for a line with nothing to group it by — always sorted after the named groups. */
function groupLabel(line: DisassemblyLineProgress, sort: SortMode): string {
  if (sort === "location") return line.location ?? "No location set";
  return line.subsystemName ?? "General inventory";
}

function sortLines(lines: DisassemblyLineProgress[], sort: SortMode): DisassemblyLineProgress[] {
  const fallback = sort === "location" ? "No location set" : "General inventory";
  return [...lines].sort((a, b) => {
    const ga = groupLabel(a, sort);
    const gb = groupLabel(b, sort);
    if (ga !== gb) {
      if (ga === fallback) return 1;
      if (gb === fallback) return -1;
      return ga.localeCompare(gb);
    }
    return a.partName.localeCompare(b.partName);
  });
}

/** Splits an already-sorted line list into consecutive same-group sections, for the subsystem/location sort modes. */
function groupSections(lines: DisassemblyLineProgress[], sort: SortMode): { heading: string; lines: DisassemblyLineProgress[] }[] {
  const sections: { heading: string; lines: DisassemblyLineProgress[] }[] = [];
  for (const line of lines) {
    const heading = groupLabel(line, sort);
    const last = sections[sections.length - 1];
    if (last && last.heading === heading) last.lines.push(line);
    else sections.push({ heading, lines: [line] });
  }
  return sections;
}

function SortToggle({ projectId, sort }: { projectId: string; sort: SortMode }) {
  const options: { value: SortMode; label: string }[] = [
    { value: "subsystem", label: "By subsystem" },
    { value: "location", label: "By location" },
  ];
  return (
    <div className="flex rounded-md border border-hairline-strong bg-surface p-0.5 text-xs">
      {options.map((o) => (
        <Link
          key={o.value}
          href={o.value === "subsystem" ? `/team/build/disassemble/${projectId}` : `/team/build/disassemble/${projectId}?sort=${o.value}`}
          className={`rounded px-2.5 py-1 font-medium transition ${
            sort === o.value ? "bg-navy text-white" : "text-ink/60 hover:bg-tint"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

function DisassemblyLineRow({
  line,
  projectId,
  canManageParts,
}: {
  line: DisassemblyLineProgress;
  projectId: string;
  canManageParts: boolean;
}) {
  const isDone = line.remainingQty === 0;
  const returnedQty = Math.max(0, line.expectedQty - line.remainingQty - line.lostQty);

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-2.5 text-sm ${
        isDone ? "border-hairline bg-surface text-ink/40" : "border-hairline bg-surface text-ink"
      }`}
    >
      {line.partImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary external vendor image, no next/image domain config
        <img src={line.partImageUrl} alt="" className="mt-0.5 h-9 w-9 flex-none rounded object-cover" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        {/* Row 1: part name + qty */}
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-medium">{line.partName}</span>
          <span className={`flex-none font-semibold ${isDone ? "text-ink/40" : "text-navy"}`}>
            {returnedQty}/{line.expectedQty}
            {line.lostQty > 0 && <span className="ml-1 font-normal text-crimson">({line.lostQty} lost)</span>}
          </span>
        </div>

        {/* Row 2: subsystem + return-to location */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink/50">
          {line.subsystemName ? (
            <span className="flex-none rounded-full bg-navy/10 px-2 py-0.5 text-[10px] font-semibold text-navy">
              {line.subsystemName}
            </span>
          ) : (
            <span className="flex-none rounded-full bg-hairline px-2 py-0.5 text-[10px] font-semibold text-ink/50">
              General inventory
            </span>
          )}
          <span className="min-w-0 truncate">
            {line.location ? (
              <>↩ Return to 📍 {line.location}</>
            ) : (
              "No location set — return with whoever knows where it lives"
            )}
          </span>
        </div>

        {/* Row 3: actions */}
        <div className="flex items-center gap-2">
          {isDone ? (
            <span className="text-xs font-medium text-emerald-600">✓ Accounted for</span>
          ) : canManageParts ? (
            <>
              {line.bomLineId ? (
                <DisassemblyLineReturnButton bomLineId={line.bomLineId} defaultQty={line.remainingQty} />
              ) : (
                <ManualReturnButton projectId={projectId} partId={line.partId} defaultQty={line.remainingQty} />
              )}
              <MarkPartLostButton sessionLineId={line.id} remainingQty={line.remainingQty} />
            </>
          ) : (
            <span className="text-xs text-ink/40">Awaiting return</span>
          )}
        </div>
      </div>
    </div>
  );
}

async function DisassemblyChecklist({
  projectId,
  sessionId,
  canManageParts,
  sort,
}: {
  projectId: string;
  sessionId: string;
  canManageParts: boolean;
  sort: SortMode;
}) {
  const progress = await getDisassemblyProgress(sessionId, projectId);
  const cotsLines = sortLines(
    progress.filter((l) => !l.isFabricated),
    sort,
  );
  const fabricatedLines = progress.filter((l) => l.isFabricated);
  const returned = cotsLines.reduce((sum, l) => sum + Math.max(0, l.expectedQty - l.remainingQty - l.lostQty), 0);
  const expected = cotsLines.reduce((sum, l) => sum + l.expectedQty, 0);
  const lost = cotsLines.reduce((sum, l) => sum + l.lostQty, 0);
  const missingUnits = cotsLines.reduce((sum, l) => sum + l.remainingQty, 0);
  const sections = groupSections(cotsLines, sort);

  return (
    <div className="mt-6 max-w-2xl">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">
            {returned} of {expected} expected COTS parts returned
            {lost > 0 && <span className="font-normal text-crimson"> · {lost} lost</span>}
          </p>
          <div className="flex flex-none items-center gap-2">
            <SortToggle projectId={projectId} sort={sort} />
            {canManageParts && (
              <CompleteDisassemblyButton sessionId={sessionId} projectId={projectId} missingCount={missingUnits} />
            )}
          </div>
        </div>

        {cotsLines.length === 0 ? (
          <p className="mt-4 text-sm text-ink/50">No COTS parts to return.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {sections.map((section, i) => (
              <div key={section.heading || i}>
                {section.heading && (
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-ink/40">
                    {section.heading}
                  </p>
                )}
                <div className="space-y-1.5">
                  {section.lines.map((line) => (
                    <DisassemblyLineRow key={line.id} line={line} projectId={projectId} canManageParts={canManageParts} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {fabricatedLines.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink/40">
              Fabricated — discarded, not returned
            </p>
            <p className="mt-1 text-xs text-ink/50">
              3D-print/custom-cut parts never go back to general stock — no need to scan these. Finishing this
              session deletes them from inventory for good.
            </p>
            <div className="mt-2 space-y-1.5">
              {fabricatedLines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-2.5 text-sm text-ink/50"
                >
                  <span className="truncate">{line.partName}</span>
                  <span className="flex-none font-semibold">{line.remainingQty}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
