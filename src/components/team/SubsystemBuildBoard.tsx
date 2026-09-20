"use client";

import BuildBoardBox, { BoardEmpty } from "@/components/team/BuildBoardBox";
import FabricationLinesSection from "@/components/team/FabricationLinesSection";
import FabricationUploadButton from "@/components/team/FabricationUploadButton";
import BomLineCategorySelect from "@/components/team/BomLineCategorySelect";
import LinkPartPicker from "@/components/team/LinkPartPicker";
import ManualCollectButton from "@/components/team/ManualCollectButton";
import MarkPurchasedButton from "@/components/team/MarkPurchasedButton";
import MarkPurchaseCollectedButton from "@/components/team/MarkPurchaseCollectedButton";
import CollectFromOtherProjectButton from "@/components/team/CollectFromOtherProjectButton";
import DeleteBomLineButton from "@/components/team/DeleteBomLineButton";
import PutBackSurplusButton from "@/components/team/PutBackSurplusButton";
import { BomManualCollectFeedProvider } from "@/components/team/BomManualCollectFeed";
import { PRINT_FILE_EXTENSIONS, CUT_FILE_EXTENSIONS } from "@/lib/bom/fileTypes";
import type { OtherProjectAllocation } from "@/lib/bom/actions";
import type { BomLineFileRow, BomLineRow } from "@/lib/supabase/types";

const FABRICATION_NOTES = {
  "3d_print": {
    formats: PRINT_FILE_EXTENSIONS.join(", "),
    naming: "All file names should have the following format: PARTNAME_COLOR_QTY_MATERIAL(IF NOT PETG)",
  },
  custom_cut: {
    formats: CUT_FILE_EXTENSIONS.join(", "),
    naming: "All file names should have the following format: PARTNAME_QTY_MATERIAL",
  },
} as const;

function FabricationNote({ category }: { category: "3d_print" | "custom_cut" }) {
  const note = FABRICATION_NOTES[category];
  return (
    <div className="mb-3 rounded-md bg-tint/50 px-3 py-2 text-xs text-ink/60">
      <p>Allowed file types: {note.formats}</p>
      <p className="mt-0.5 font-medium text-ink/70">{note.naming}</p>
    </div>
  );
}

type MatchedPart = {
  id: string;
  name: string;
  part_number: string | null;
  qty_in_stock: number;
  link: string | null;
  location: string | null;
  image_url: string | null;
};

export default function SubsystemBuildBoard({
  subsystemId,
  lines,
  matchedParts,
  filesByLine,
  allParts,
  otherProjectAllocationsByPart,
  canManageParts,
}: {
  subsystemId: string;
  lines: BomLineRow[];
  matchedParts: Map<string, MatchedPart>;
  filesByLine: Map<string, BomLineFileRow[]>;
  allParts: { id: string; name: string; part_number: string | null }[];
  otherProjectAllocationsByPart: Map<string, OtherProjectAllocation[]>;
  canManageParts: boolean;
}) {
  const orderLines = lines.filter((l) => l.category === "order");
  const markers = orderLines.filter((l) => l.qty_needed === 0 && l.qty_scanned > 0);
  // Unmatched lines ("no match — search for a part") live in the purchase box
  // until a real inventory part is linked to them. A line with 0 on hand at
  // add-time has qty_collect === 0 — nothing to show as "in stock" for it
  // (it's 100% qty_order), so it belongs only in the purchase box until some
  // of that order is fulfilled and actually moves into qty_collect.
  const cotsLines = orderLines.filter((l) => l.qty_needed > 0 && l.matched_part_id && l.qty_collect > 0);
  const purchaseLines = orderLines.filter(
    (l) => l.qty_needed > 0 && (l.qty_order - l.qty_fulfilled > 0 || !l.matched_part_id),
  );
  const printLines = lines.filter((l) => l.category === "3d_print");
  const cutLines = lines.filter((l) => l.category === "custom_cut");

  return (
    <BomManualCollectFeedProvider>
      <div className="grid gap-4 md:grid-cols-2">
        <BuildBoardBox title="COTS Parts (in stock)" count={cotsLines.length}>
          {markers.map((line) => (
            <div
              key={line.id}
              className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-crimson/30 bg-crimson/5 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{line.name}</p>
                <p className="text-xs text-crimson">Not in the current BOM — {line.qty_scanned} allocated</p>
              </div>
              {canManageParts && <PutBackSurplusButton lineId={line.id} qty={line.qty_scanned} />}
            </div>
          ))}

          {cotsLines.length === 0 && markers.length === 0 ? (
            <BoardEmpty>No COTS parts yet.</BoardEmpty>
          ) : (
            <div className="space-y-1.5">
              {cotsLines.map((line) => {
                const part = line.matched_part_id ? matchedParts.get(line.matched_part_id) : undefined;
                const remaining = Math.max(0, line.qty_collect - line.qty_scanned);
                const stock = part?.qty_in_stock ?? 0;
                const done = line.qty_scanned >= line.qty_needed;
                return (
                  <div key={line.id} className="rounded-lg border border-hairline px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {part?.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element -- arbitrary external vendor image, no next/image domain config
                          <img
                            src={part.image_url}
                            alt=""
                            className="h-9 w-9 flex-none rounded object-cover"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            📍 {part?.location ?? "No location set"}
                          </p>
                          <p className="truncate text-xs text-ink/60">{line.name}</p>
                          <p className="text-xs text-ink/45">
                            {line.part_number && `#${line.part_number} · `}
                            needed {line.qty_needed} · collected {line.qty_scanned}
                            {part && ` · ${stock} in stock`}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-none flex-wrap items-center gap-2">
                        {done && <span className="text-xs font-semibold text-navy">✓ collected</span>}
                        {canManageParts && line.matched_part_id && remaining > 0 && (
                          <ManualCollectButton
                            lineId={line.id}
                            defaultQty={Math.min(remaining, stock)}
                            maxQty={stock}
                          />
                        )}
                        {canManageParts && <BomLineCategorySelect lineId={line.id} category={line.category} />}
                        {canManageParts && (
                          <DeleteBomLineButton lineId={line.id} collectedQty={line.qty_scanned} />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </BuildBoardBox>

        <BuildBoardBox title="COTS Parts (for purchase)" count={purchaseLines.length}>
          {purchaseLines.length === 0 ? (
            <BoardEmpty>Nothing to buy.</BoardEmpty>
          ) : (
            <div className="space-y-1.5">
              {purchaseLines.map((line) => {
                const part = line.matched_part_id ? matchedParts.get(line.matched_part_id) : undefined;
                const need = Math.max(line.qty_order - line.qty_fulfilled, line.matched_part_id ? 0 : line.qty_needed);
                const link = line.vendor_link ?? part?.link ?? null;
                const otherAllocs = line.matched_part_id
                  ? (otherProjectAllocationsByPart.get(line.matched_part_id) ?? [])
                      .map((a) => ({ ...a, qty: Math.min(a.qty, need) }))
                      .filter((a) => a.qty > 0)
                  : [];
                return (
                  <div
                    key={line.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {part?.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element -- arbitrary external vendor image, no next/image domain config
                        <img src={part.image_url} alt="" className="h-9 w-9 flex-none rounded object-cover" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{line.name}</p>
                        <p className="text-xs text-ink/50">
                          {line.part_number && `#${line.part_number} · `}buy {need}
                        </p>
                        {otherAllocs.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {otherAllocs.map((a) => (
                              <CollectFromOtherProjectButton
                                key={a.projectId}
                                lineId={line.id}
                                fromProjectId={a.projectId}
                                fromProjectName={a.projectName}
                                qty={a.qty}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-none flex-wrap items-center gap-2">
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full bg-crimson/10 px-2.5 py-1 text-xs font-semibold text-crimson hover:bg-crimson/20"
                        >
                          Open link →
                        </a>
                      )}
                      {!line.matched_part_id && canManageParts && (
                        <LinkPartPicker lineId={line.id} parts={allParts} />
                      )}
                      {canManageParts && need > 0 && (
                        <MarkPurchaseCollectedButton lineId={line.id} maxQty={need} />
                      )}
                      {canManageParts && <MarkPurchasedButton lineId={line.id} />}
                      {canManageParts && <BomLineCategorySelect lineId={line.id} category={line.category} />}
                      {canManageParts && (
                        <DeleteBomLineButton lineId={line.id} collectedQty={line.qty_scanned} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </BuildBoardBox>

        <BuildBoardBox
          title="3D Printed"
          count={printLines.length}
          action={
            canManageParts ? <FabricationUploadButton subsystemId={subsystemId} category="3d_print" /> : undefined
          }
        >
          <FabricationNote category="3d_print" />
          {printLines.length === 0 ? (
            <BoardEmpty>No 3D-printed parts yet.</BoardEmpty>
          ) : (
            <FabricationLinesSection
              category="3d_print"
              lines={printLines}
              filesByLine={filesByLine}
              canManageParts={canManageParts}
            />
          )}
        </BuildBoardBox>

        <BuildBoardBox
          title="Custom Cut (Laser / CNC)"
          count={cutLines.length}
          action={
            canManageParts ? <FabricationUploadButton subsystemId={subsystemId} category="custom_cut" /> : undefined
          }
        >
          <FabricationNote category="custom_cut" />
          {cutLines.length === 0 ? (
            <BoardEmpty>No custom-cut parts yet.</BoardEmpty>
          ) : (
            <FabricationLinesSection
              category="custom_cut"
              lines={cutLines}
              filesByLine={filesByLine}
              canManageParts={canManageParts}
            />
          )}
        </BuildBoardBox>
      </div>
    </BomManualCollectFeedProvider>
  );
}
