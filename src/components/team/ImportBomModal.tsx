"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startBomImportFromCsvAction, startBomImportFromLinkAction } from "@/lib/bom/actions";

type Mode = "csv" | "link";

export default function ImportBomModal({
  subsystemId,
  hasExistingBom = false,
}: {
  subsystemId: string;
  /** When true, importing replaces the subsystem's current BOM — show a confirm step. */
  hasExistingBom?: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("csv");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [isSubmitting, startSubmit] = useTransition();

  function reset() {
    setMode("csv");
    setFile(null);
    setUrl("");
    setError(null);
    setConfirmingReplace(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleContinue() {
    if (hasExistingBom && !confirmingReplace) {
      setConfirmingReplace(true);
      return;
    }
    setError(null);
    startSubmit(async () => {
      const res =
        mode === "csv"
          ? file
            ? await startBomImportFromCsvAction(subsystemId, file.name, await file.text())
            : { error: "Choose a CSV file first." }
          : await startBomImportFromLinkAction(subsystemId, url);

      if (res.error || !res.id) {
        setError(res.error ?? "Couldn't start that import.");
        setConfirmingReplace(false);
        return;
      }
      dialogRef.current?.close();
      router.push(`/team/build/subsystem/${subsystemId}`);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white transition hover:bg-crimson-bright"
      >
        {hasExistingBom ? "Re-import the Bill of Materials" : "Import the Bill of Materials"}
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-lg rounded-xl p-0 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        onClose={reset}
      >
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="flex items-start justify-between">
            <h2 className="font-display text-xl font-bold text-ink">Import BOM</h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ink/40 hover:text-ink/70"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <p className="mt-1 text-sm text-ink/60">
            Upload a BOM CSV exported from Onshape, or paste a link to a publicly-shared Onshape document.
          </p>

          {confirmingReplace ? (
            <div className="mt-5 rounded-lg border border-crimson/30 bg-crimson/5 p-4">
              <p className="text-sm font-semibold text-crimson">Replace the entire BOM for this subsystem?</p>
              <p className="mt-1.5 text-sm text-ink/70">
                Every imported line is removed and replaced with the new BOM. Parts you&rsquo;ve already collected
                stay: they&rsquo;re applied toward the new BOM where it still needs them, and any surplus is pinned
                to the top of the In-stock box for you to put back.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingReplace(false)}
                  className="rounded-md px-4 py-2 text-sm font-medium text-ink/60 hover:bg-tint"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleContinue}
                  className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-bright disabled:opacity-50"
                >
                  {isSubmitting ? "Replacing…" : "Replace BOM"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-5 space-y-4">
                <div className="flex gap-1 rounded-md bg-tint/50 p-1 text-sm">
                  <button
                    type="button"
                    onClick={() => setMode("csv")}
                    className={`flex-1 rounded px-3 py-1.5 font-semibold transition ${
                      mode === "csv" ? "bg-surface text-ink shadow-sm" : "text-ink/50 hover:text-ink/70"
                    }`}
                  >
                    Upload CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("link")}
                    className={`flex-1 rounded px-3 py-1.5 font-semibold transition ${
                      mode === "link" ? "bg-surface text-ink shadow-sm" : "text-ink/50 hover:text-ink/70"
                    }`}
                  >
                    Paste Onshape link
                  </button>
                </div>

                {mode === "csv" ? (
                  <div>
                    <label htmlFor="bomCsv" className="text-sm font-medium text-ink/80">
                      BOM CSV export
                    </label>
                    <input
                      id="bomCsv"
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm outline-none file:mr-3 file:rounded file:border-0 file:bg-tint file:px-2.5 file:py-1 file:text-xs file:font-semibold"
                    />
                    <p className="mt-1 text-xs text-ink/50">
                      In Onshape, open the assembly&rsquo;s BOM tab and export it to CSV.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="bomUrl" className="text-sm font-medium text-ink/80">
                      Onshape document link
                    </label>
                    <input
                      id="bomUrl"
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://cad.onshape.com/documents/.../w/.../e/..."
                      className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                    />
                    <p className="mt-1 text-xs text-ink/50">
                      The document must be shared as &ldquo;Public&rdquo; or &ldquo;Anyone with the link can view&rdquo; in
                      Onshape — the server has no login of its own.
                    </p>
                  </div>
                )}
              </div>

              {error && <p className="mt-3 text-sm text-crimson">{error}</p>}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => dialogRef.current?.close()}
                  className="rounded-md px-4 py-2 text-sm font-medium text-ink/60 hover:bg-tint"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || (mode === "csv" ? !file : !url.trim())}
                  onClick={handleContinue}
                  className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-bright disabled:opacity-50"
                >
                  {isSubmitting ? "Reading…" : hasExistingBom ? "Continue" : "Import"}
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
