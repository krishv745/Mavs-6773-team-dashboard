"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { fetchLinkMetadataAction, updatePartAction } from "@/lib/parts/actions";
import SubmitButton from "@/components/team/SubmitButton";
import type { PartRow } from "@/lib/supabase/types";

export default function EditPartModal({ part, locations = [] }: { part: PartRow; locations?: string[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(updatePartAction, undefined);
  const [link, setLink] = useState(part.link ?? "");
  const [imageUrl, setImageUrl] = useState(part.image_url ?? "");
  const [unitCost, setUnitCost] = useState(part.unit_cost !== null ? String(part.unit_cost) : "");
  const [fetchNote, setFetchNote] = useState<string | null>(null);
  const [isFetching, startFetch] = useTransition();

  useEffect(() => {
    if (state && !state.error) dialogRef.current?.close();
  }, [state]);

  function handleFetchInfo() {
    if (!link) return;
    startFetch(async () => {
      const result = await fetchLinkMetadataAction(link);
      if (result.imageUrl || result.unitCost !== undefined) {
        if (result.imageUrl) setImageUrl(result.imageUrl);
        if (result.unitCost !== undefined) setUnitCost(String(result.unitCost));
        setFetchNote(null);
      } else {
        setFetchNote(result.error ?? "Couldn't find an image or price on that page.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`Edit ${part.name}`}
        title="Edit part"
        className="text-ink/40 transition hover:text-navy"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path
            d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl p-0 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="p-6">
          <div className="flex items-start justify-between">
            <h2 className="font-display text-xl font-bold text-ink">Edit Part</h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ink/40 hover:text-ink/70"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <form action={formAction} className="mt-5 space-y-4">
            <input type="hidden" name="partId" value={part.id} />
            <input type="hidden" name="imageUrl" value={imageUrl} />

            <div>
              <label htmlFor={`edit-name-${part.id}`} className="text-sm font-medium text-ink/80">
                Part name
              </label>
              <input
                id={`edit-name-${part.id}`}
                name="name"
                required
                defaultValue={part.name}
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>

            <div>
              <label htmlFor={`edit-link-${part.id}`} className="text-sm font-medium text-ink/80">
                Link
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id={`edit-link-${part.id}`}
                  name="link"
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  className="w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                />
                <button
                  type="button"
                  onClick={handleFetchInfo}
                  disabled={!link || isFetching}
                  className="flex-none rounded-md border border-hairline-strong px-3 py-2 text-xs font-semibold text-ink/70 transition hover:bg-tint disabled:opacity-50"
                >
                  {isFetching ? "Fetching…" : "Fetch info"}
                </button>
              </div>
              {fetchNote && <p className="mt-1 text-xs text-ink/50">{fetchNote}</p>}
              {imageUrl && (
                <div className="mt-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external vendor image, no next/image domain config */}
                  <img src={imageUrl} alt="" className="h-12 w-12 rounded object-cover" />
                  <span className="text-xs text-ink/50">Current image</span>
                </div>
              )}
            </div>

            <div>
              <label htmlFor={`edit-partNumber-${part.id}`} className="text-sm font-medium text-ink/80">
                Part number
              </label>
              <input
                id={`edit-partNumber-${part.id}`}
                name="partNumber"
                defaultValue={part.part_number ?? ""}
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`edit-location-${part.id}`} className="text-sm font-medium text-ink/80">
                  Location
                </label>
                <input
                  id={`edit-location-${part.id}`}
                  name="location"
                  list={`part-locations-edit-${part.id}`}
                  autoComplete="off"
                  defaultValue={part.location ?? ""}
                  className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                />
                <datalist id={`part-locations-edit-${part.id}`}>
                  {locations.map((loc) => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor={`edit-qty-${part.id}`} className="text-sm font-medium text-ink/80">
                  Qty in stock
                </label>
                <input
                  id={`edit-qty-${part.id}`}
                  name="qty"
                  type="number"
                  min={0}
                  defaultValue={part.qty_in_stock}
                  className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                />
              </div>
            </div>

            <div>
              <label htmlFor={`edit-unitCost-${part.id}`} className="text-sm font-medium text-ink/80">
                Cost per unit
              </label>
              <input
                id={`edit-unitCost-${part.id}`}
                name="unitCost"
                type="number"
                min={0}
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0.00"
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>

            {state?.error && (
              <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
            )}

            <SubmitButton>Save changes</SubmitButton>
          </form>
        </div>
      </dialog>
    </>
  );
}
