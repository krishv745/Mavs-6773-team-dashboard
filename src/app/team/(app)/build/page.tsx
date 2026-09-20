import Link from "next/link";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, hasPermission } from "@/lib/auth/session";
import AddPartModal from "@/components/team/AddPartModal";
import BuildProjectPicker from "@/components/team/BuildProjectPicker";
import PartsTable from "@/components/team/PartsTable";
import ReallocateModal from "@/components/team/ReallocateModal";
import BackfillImagesButton from "@/components/team/BackfillImagesButton";
import BackfillCostsButton from "@/components/team/BackfillCostsButton";
import type { PartRow } from "@/lib/supabase/types";

type MissingFilterKey = "missingLink" | "missingLocation" | "missingCost" | "missingImage";

export default async function BuildPage({
  searchParams,
}: {
  searchParams: Promise<Record<MissingFilterKey, string | undefined>>;
}) {
  const { missingLink, missingLocation, missingCost, missingImage } = await searchParams;
  const [profile, supabase] = await Promise.all([getCurrentProfile(), createServerClient()]);
  const staff = hasPermission(profile, "manage_parts");

  const [{ data: parts }, { data: projects }, { data: allocations }] = await Promise.all([
    supabase.from("parts").select("*").order("name", { ascending: true }),
    supabase.from("projects").select("*").order("name", { ascending: true }),
    supabase.from("part_allocations").select("*"),
  ]);

  const projectMap = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const allocByPart: Record<string, { project: string; qty: number }[]> = {};
  for (const a of allocations ?? []) {
    if (a.qty <= 0) continue;
    const list = allocByPart[a.part_id] ?? [];
    list.push({ project: projectMap.get(a.project_id) ?? "Unknown", qty: a.qty });
    allocByPart[a.part_id] = list;
  }

  // Fabricated (3D-print/custom-cut) parts never have a vendor link by design —
  // they're made in-house, not purchased, so excluding them keeps this filter
  // pointed at parts that genuinely should have one (e.g. a vendor-order line
  // that didn't cleanly match an existing part).
  const isPurchasable = (p: { manufacturing_method: string | null }) =>
    p.manufacturing_method !== "3d_print" && p.manufacturing_method !== "custom_cut";

  // Same "N missing X" pill/banner/filter treatment for every field worth flagging —
  // described once here rather than four near-identical blocks.
  const missingFilters: {
    key: MissingFilterKey;
    active: boolean;
    label: string;
    emptyMessage: string;
    bannerText: (count: number) => string;
    test: (p: PartRow) => boolean;
  }[] = [
    {
      key: "missingLink",
      active: Boolean(missingLink),
      label: "missing a link",
      emptyMessage: "Every part has a link.",
      bannerText: (n) =>
        `Showing ${n} purchasable part${n === 1 ? "" : "s"} with no link — usually a BOM or vendor-order line that didn't cleanly match an existing part. Click a part's edit icon to paste one in.`,
      test: (p) => !p.link && isPurchasable(p),
    },
    {
      key: "missingLocation",
      active: Boolean(missingLocation),
      label: "missing a location",
      emptyMessage: "Every part has a location.",
      bannerText: (n) => `Showing ${n} part${n === 1 ? "" : "s"} with no storage location set.`,
      test: (p) => !p.location,
    },
    {
      key: "missingCost",
      active: Boolean(missingCost),
      label: "missing a cost",
      emptyMessage: "Every priced part has a cost.",
      bannerText: (n) => `Showing ${n} linked part${n === 1 ? "" : "s"} with no cost on file.`,
      test: (p) => Boolean(p.link) && p.unit_cost == null,
    },
    {
      key: "missingImage",
      active: Boolean(missingImage),
      label: "missing an image",
      emptyMessage: "Every linked part has an image.",
      bannerText: (n) => `Showing ${n} linked part${n === 1 ? "" : "s"} with no image on file.`,
      test: (p) => Boolean(p.link) && !p.image_url,
    },
  ];
  const counts = new Map(missingFilters.map((f) => [f.key, (parts ?? []).filter(f.test).length]));
  const activeFilter = missingFilters.find((f) => f.active) ?? null;

  let visibleParts = parts ?? [];
  if (activeFilter) visibleParts = visibleParts.filter(activeFilter.test);

  const locations = [...new Set((parts ?? []).map((p) => p.location).filter((l): l is string => Boolean(l)))].sort();
  const missingImageCount = counts.get("missingImage")!;
  const missingCostCount = counts.get("missingCost")!;
  const totalCost = (parts ?? []).reduce((sum, p) => sum + (p.unit_cost ?? 0), 0);
  const partsWithCost = (parts ?? []).filter((p) => p.unit_cost != null).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Build — Parts Manager</h1>
          <p className="mt-1 text-sm text-ink/60">
            {(parts ?? []).length} parts tracked
            {partsWithCost > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-ink">
                  ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>{" "}
                total cost ({partsWithCost} of {(parts ?? []).length} priced)
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BuildProjectPicker projects={projects ?? []} />
          {staff && missingImageCount > 0 && <BackfillImagesButton />}
          {staff && missingCostCount > 0 && <BackfillCostsButton />}
          {staff &&
            missingFilters.map((f) => {
              const count = counts.get(f.key)!;
              if (count === 0 || f.active) return null;
              return (
                <Link
                  key={f.key}
                  href={`/team/build?${f.key}=1`}
                  className="rounded-md border border-crimson/30 bg-crimson/5 px-4 py-2 text-sm font-semibold text-crimson transition hover:bg-crimson/10"
                >
                  {count} {f.label}
                </Link>
              );
            })}
          {staff && (
            <Link
              href="/team/build/receive-order"
              className="rounded-md border border-hairline-strong bg-surface px-4 py-2 text-sm font-semibold text-ink/70 transition hover:bg-tint"
            >
              Receive order
            </Link>
          )}
          <ReallocateModal parts={parts ?? []} projects={projects ?? []} />
          <AddPartModal locations={locations} />
        </div>
      </div>

      {activeFilter && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-crimson/30 bg-crimson/5 px-4 py-2.5 text-sm text-crimson">
          <span>{activeFilter.bannerText(counts.get(activeFilter.key)!)}</span>
          <Link href="/team/build" className="flex-none font-semibold hover:underline">
            Clear filter
          </Link>
        </div>
      )}

      <div className="mt-6">
        <PartsTable
          parts={visibleParts}
          allocByPart={allocByPart}
          locations={locations}
          emptyMessage={activeFilter ? activeFilter.emptyMessage : "No parts yet — add your first one."}
          canManageParts={staff}
        />
      </div>
    </div>
  );
}
