"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createPartAction, fetchLinkMetadataAction } from "@/lib/parts/actions";
import SubmitButton from "@/components/team/SubmitButton";

export default function AddPartModal({ locations = [] }: { locations?: string[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(createPartAction, undefined);
  const [link, setLink] = useState("");
  const [name, setName] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [fetchNote, setFetchNote] = useState<string | null>(null);
  const [isFetching, startFetch] = useTransition();

  useEffect(() => {
    if (state?.error) dialogRef.current?.showModal();
  }, [state]);

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

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white transition hover:bg-crimson-bright"
      >
        + Add Part
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
            <h2 className="font-display text-xl font-bold text-ink">Add Part</h2>
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
            <div>
              <label htmlFor="link" className="text-sm font-medium text-ink/80">
                Link (optional)
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="link"
                  name="link"
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://..."
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
                  <span className="text-xs text-ink/50">Image found</span>
                </div>
              )}
              <input type="hidden" name="imageUrl" value={imageUrl} />
            </div>

            <div>
              <label htmlFor="name" className="text-sm font-medium text-ink/80">
                Part name
              </label>
              <input
                id="name"
                name="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>

            <div>
              <label htmlFor="partNumber" className="text-sm font-medium text-ink/80">
                Part number (optional)
              </label>
              <input
                id="partNumber"
                name="partNumber"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="location" className="text-sm font-medium text-ink/80">
                  Location
                </label>
                <input
                  id="location"
                  name="location"
                  list="part-locations-add"
                  autoComplete="off"
                  className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                />
                <datalist id="part-locations-add">
                  {locations.map((loc) => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor="qty" className="text-sm font-medium text-ink/80">
                  Qty in stock
                </label>
                <input
                  id="qty"
                  name="qty"
                  type="number"
                  min={0}
                  defaultValue={0}
                  className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                />
              </div>
            </div>

            <div>
              <label htmlFor="unitCost" className="text-sm font-medium text-ink/80">
                Cost per unit (optional)
              </label>
              <input
                id="unitCost"
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

            <SubmitButton>Add part</SubmitButton>
          </form>
        </div>
      </dialog>
    </>
  );
}
