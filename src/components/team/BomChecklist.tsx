import { BOM_CATEGORY_LABEL, type BomCategory } from "@/lib/onshape/materialCategories";
import BomLineCategorySelect from "@/components/team/BomLineCategorySelect";
import DeleteBomLineButton from "@/components/team/DeleteBomLineButton";
import LinkPartPicker from "@/components/team/LinkPartPicker";
import BulkPrintButton from "@/components/team/BulkPrintButton";
import ManualCollectButton from "@/components/team/ManualCollectButton";
import ManualReturnButton from "@/components/team/ManualReturnButton";
import MarkPurchasedButton from "@/components/team/MarkPurchasedButton";
import FabricationLinesSection from "@/components/team/FabricationLinesSection";
import { BomManualCollectFeedProvider } from "@/components/team/BomManualCollectFeed";
import type { BomLineFileRow, BomLineRow, ProjectRow } from "@/lib/supabase/types";

const CATEGORY_ORDER: BomCategory[] = ["order", "3d_print", "custom_cut"];

export default function BomChecklist({
  project,
  lines,
  matchedParts,
  allocQtyByPart,
  allParts,
  filesByLine,
  canManageParts,
}: {
  project: ProjectRow;
  lines: BomLineRow[];
  matchedParts: Map<string, { id: string; name: string; part_number: string | null; qty_in_stock: number; link: string | null }>;
  /** Live part_allocations qty for this project, keyed by part id — the source of truth for "how much is currently with this project," not the one-way qty_scanned counter. */
  allocQtyByPart: Map<string, number>;
  allParts: { id: string; name: string; part_number: string | null }[];
  filesByLine: Map<string, BomLineFileRow[]>;
  canManageParts: boolean;
}) {
  const grouped: Record<BomCategory, BomLineRow[]> = { order: [], "3d_print": [], custom_cut: [] };
  for (const line of lines) grouped[line.category].push(line);

  const fabricateParts = lines.filter((l) => l.category !== "order");

  return (
    <BomManualCollectFeedProvider>
      <div>
        {canManageParts && fabricateParts.length > 0 && (
          <div className="mb-4 flex justify-end">
            <BulkPrintButton parts={fabricateParts.map((p) => ({ name: p.name, partNumber: p.part_number }))} />
          </div>
        )}

        <div className="space-y-6">
          {CATEGORY_ORDER.map((cat) => {
            const catLines = grouped[cat];
            if (catLines.length === 0) return null;

            if (cat !== "order") {
              return (
                <div key={cat}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-ink/40">
                    {BOM_CATEGORY_LABEL[cat]} ({catLines.length})
                  </p>
                  <div className="mt-2">
                    <FabricationLinesSection
                      category={cat}
                      lines={catLines}
                      filesByLine={filesByLine}
                      canManageParts={canManageParts}
                    />
                  </div>
                </div>
              );
            }

            return (
              <div key={cat}>
                <p className="text-xs font-semibold uppercase tracking-widest text-ink/40">
                  {BOM_CATEGORY_LABEL[cat]} ({catLines.length})
                </p>
                <div className="mt-2 space-y-1.5">
                  {catLines.map((line) => {
                    const part = line.matched_part_id ? matchedParts.get(line.matched_part_id) : undefined;
                    const needToPurchase = line.qty_order - line.qty_fulfilled;
                    const purchaseLink = line.vendor_link ?? part?.link ?? null;
                    const currentlyAllocated = line.matched_part_id ? (allocQtyByPart.get(line.matched_part_id) ?? 0) : 0;
                    const remainingToCollect = Math.max(0, line.qty_collect - currentlyAllocated);
                    const stock = part?.qty_in_stock ?? 0;

                    return (
                      <div key={line.id} className="rounded-lg border border-hairline bg-surface px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">{line.name}</p>
                            <p className="text-xs text-ink/50">
                              Collect {line.qty_collect}
                              {line.qty_order > 0 && ` · ${line.qty_fulfilled}/${line.qty_order} received`}
                              {part && ` · ${part.name}`}
                            </p>
                          </div>
                          <div className="flex flex-none flex-wrap items-center gap-2">
                            {!line.matched_part_id && canManageParts && (
                              <LinkPartPicker lineId={line.id} parts={allParts} />
                            )}
                            {currentlyAllocated > 0 && (
                              <span className="rounded-full bg-navy/5 px-2.5 py-1 text-xs font-semibold text-navy">
                                {currentlyAllocated} in this project now
                              </span>
                            )}
                            {needToPurchase > 0 && (
                              <>
                                {purchaseLink ? (
                                  <a
                                    href={purchaseLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-full bg-crimson/10 px-2.5 py-1 text-xs font-semibold text-crimson hover:bg-crimson/20"
                                  >
                                    Need to purchase {needToPurchase} →
                                  </a>
                                ) : (
                                  <span className="rounded-full bg-crimson/10 px-2.5 py-1 text-xs font-semibold text-crimson">
                                    Need to purchase {needToPurchase}
                                  </span>
                                )}
                                {canManageParts && <MarkPurchasedButton lineId={line.id} />}
                              </>
                            )}
                            {canManageParts && remainingToCollect > 0 && (
                              <ManualCollectButton
                                lineId={line.id}
                                defaultQty={Math.min(remainingToCollect, stock)}
                                maxQty={stock}
                              />
                            )}
                            {canManageParts && line.matched_part_id && currentlyAllocated > 0 && (
                              <ManualReturnButton
                                projectId={project.id}
                                partId={line.matched_part_id}
                                defaultQty={currentlyAllocated}
                              />
                            )}
                            {canManageParts && <BomLineCategorySelect lineId={line.id} category={line.category} />}
                            {canManageParts && <DeleteBomLineButton lineId={line.id} />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {lines.length === 0 && <p className="text-sm text-ink/40">This import has no lines.</p>}
        </div>
      </div>
    </BomManualCollectFeedProvider>
  );
}
