"use client";

import { useState, useTransition } from "react";
import { createUnassignedPartAction, fetchLinkMetadataAction } from "@/lib/parts/actions";

/**
 * Inline "＋ Add part" form shared by LinkPartPicker (no match for a BOM
 * line) and AddCotsFromInventoryModal (adding a COTS part to a subsystem) —
 * both let someone paste a product link, auto-fill name/part number/image/
 * cost from it, and receive the part straight into the general parts
 * database without leaving that flow. Always saved with no location; that's
 * filed in later from the main Parts table once someone knows where it
 * physically lives.
 */
export default function QuickAddPart({
  onCreated,
  onCancel,
}: {
  onCreated: (part: { id: string; name: string; part_number: string | null; qty_in_stock: number }) => void;
  onCancel: () => void;
}) {
  const [link, setLink] = useState("");
  const [name, setName] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [qty, setQty] = useState<number | "">("");
  const [unitCost, setUnitCost] = useState("");
  const [fetchNote, setFetchNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, startFetch] = useTransition();
  const [isSaving, startSave] = useTransition();

  function handleFetchInfo() {
    if (!link) return;
    startFetch(async () => {
      const result = await fetchLinkMetadataAction(link);
      if (result.name) {
        setName(result.name);
        if (result.partNumber) setPartNumber(result.partNumber);
        setImageUrl(result.imageUrl ?? "");
        if (result.unitCost !== undefined) setUnitCost(String(result.unitCost));
        setFetchNote(
          result.partNumber ? null : "Found the name, but couldn't spot a part number — check it below.",
        );
      } else {
        setFetchNote(result.error ?? "Couldn't read that link.");
      }
    });
  }

  function submit() {
    if (!name.trim()) {
      setError("Part name is required.");
      return;
    }
    setError(null);
    const qtyOnHand = qty === "" ? 0 : qty;
    startSave(async () => {
      const result = await createUnassignedPartAction({
        name,
        partNumber,
        link,
        imageUrl,
        qty: qtyOnHand,
        unitCost: unitCost ? Number(unitCost) : undefined,
      });
      if (result.error || !result.part) {
        setError(result.error ?? "Could not add that part.");
        return;
      }
      onCreated({ ...result.part, qty_in_stock: qtyOnHand });
    });
  }

  return (
    <div className="space-y-3 p-3" onMouseDown={(e) => e.stopPropagation()}>
      <div>
        <label className="text-xs font-medium text-ink/70">Link</label>
        <div className="mt-1 flex gap-1.5">
          <input
            autoFocus
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-md border border-hairline-strong px-2 py-1.5 text-xs outline-none focus:border-navy"
          />
          <button
            type="button"
            onClick={handleFetchInfo}
            disabled={!link || isFetching}
            className="flex-none rounded-md border border-hairline-strong px-2 py-1.5 text-xs font-semibold text-ink/70 transition hover:bg-tint disabled:opacity-50"
          >
            {isFetching ? "Fetching…" : "Fetch info"}
          </button>
        </div>
        {fetchNote && <p className="mt-1 text-[11px] text-ink/50">{fetchNote}</p>}
        {imageUrl && (
          <div className="mt-1.5 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external vendor image, no next/image domain config */}
            <img src={imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
            <span className="text-[11px] text-ink/50">Image found</span>
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-ink/70">Part name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-hairline-strong px-2 py-1.5 text-xs outline-none focus:border-navy"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-ink/70">Part number</label>
          <input
            value={partNumber}
            onChange={(e) => setPartNumber(e.target.value)}
            className="mt-1 w-full rounded-md border border-hairline-strong px-2 py-1.5 text-xs outline-none focus:border-navy"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-ink/70">Qty on hand</label>
          <input
            type="number"
            min={0}
            value={qty}
            onChange={(e) =>
              setQty(e.target.value === "" ? "" : Math.max(0, Math.round(Number(e.target.value) || 0)))
            }
            className="mt-1 w-full rounded-md border border-hairline-strong px-2 py-1.5 text-xs outline-none focus:border-navy"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-ink/70">Cost per unit (optional)</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={unitCost}
          onChange={(e) => setUnitCost(e.target.value)}
          placeholder="0.00"
          className="mt-1 w-full rounded-md border border-hairline-strong px-2 py-1.5 text-xs outline-none focus:border-navy"
        />
      </div>

      <p className="text-[11px] text-ink/40">
        Added with no location — file it away from the Parts page once you know where it lives.
      </p>

      {error && <p className="text-xs text-crimson">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-ink/60 hover:bg-tint"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isSaving || !name.trim()}
          onClick={submit}
          className="rounded-md bg-crimson px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-crimson-bright disabled:opacity-50"
        >
          {isSaving ? "Adding…" : "Add part"}
        </button>
      </div>
    </div>
  );
}
