"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  extractVendorOrderPdfAction,
  parseVendorOrderCsvAction,
  receiveVendorOrderAction,
} from "@/lib/bom/receiveActions";
import type { ParsedVendorOrderRow } from "@/lib/bom/csv";

type Mode = "csv" | "pdf";

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default function ReceiveOrderForm({
  projectOptions,
}: {
  projectOptions: { projectId: string; projectName: string; bomImportId: string }[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bomImportId, setBomImportId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [vendor, setVendor] = useState("");
  const [orderReference, setOrderReference] = useState("");
  const [rows, setRows] = useState<ParsedVendorOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ allocatedToProject: number; addedToStock: number } | null>(null);
  const [isExtracting, startExtract] = useTransition();
  const [isReceiving, startReceive] = useTransition();

  const selectedProjectName = projectOptions.find((p) => p.bomImportId === bomImportId)?.projectName ?? null;

  function handleExtract() {
    if (!file) return;
    setError(null);
    setRows(null);
    startExtract(async () => {
      const res =
        mode === "csv"
          ? await parseVendorOrderCsvAction(await file.text())
          : await extractVendorOrderPdfAction(await fileToBase64(file));
      if (res.error || !res.rows) {
        setError(res.error ?? "Couldn't read that file.");
        return;
      }
      setRows(res.rows);
    });
  }

  function updateQty(index: number, quantity: number) {
    setRows((prev) => prev?.map((r, i) => (i === index ? { ...r, quantity } : r)) ?? null);
  }

  function removeRow(index: number) {
    setRows((prev) => prev?.filter((_, i) => i !== index) ?? null);
  }

  function handleConfirm() {
    if (!rows || rows.length === 0) return;
    setError(null);
    startReceive(async () => {
      const res = await receiveVendorOrderAction(vendor || null, orderReference || null, bomImportId, rows);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult({ allocatedToProject: res.allocatedToProject, addedToStock: res.addedToStock });
      setRows(null);
      router.refresh();
    });
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-hairline bg-surface p-6">
        <h2 className="font-display text-lg font-bold text-ink">Order received</h2>
        <p className="mt-2 text-sm text-ink/70">
          {bomImportId && result.allocatedToProject > 0 && (
            <>
              {result.allocatedToProject} unit{result.allocatedToProject === 1 ? "" : "s"} allocated directly to{" "}
              {selectedProjectName ?? "the project"}.{" "}
            </>
          )}
          {result.addedToStock > 0 && (
            <>
              {result.addedToStock} unit{result.addedToStock === 1 ? "" : "s"} added to general inventory.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="space-y-4 rounded-xl border border-hairline bg-surface p-6">
        <div>
          <label className="text-sm font-medium text-ink/80">Tie to a project</label>
          <select
            value={bomImportId ?? ""}
            onChange={(e) => setBomImportId(e.target.value || null)}
            className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
          >
            <option value="">General restock (not tied to a project)</option>
            {projectOptions.map((p) => (
              <option key={p.projectId} value={p.bomImportId}>
                {p.projectName}
              </option>
            ))}
          </select>
          {bomImportId && (
            <p className="mt-1.5 text-xs text-ink/50">
              Matched lines allocate straight to {selectedProjectName ?? "this project"} first; any extra lands in
              general stock.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-ink/80">Vendor</label>
            <input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. goBILDA"
              className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm outline-none focus:border-navy"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink/80">Order reference</label>
            <input
              value={orderReference}
              onChange={(e) => setOrderReference(e.target.value)}
              placeholder="e.g. #200114764"
              className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm outline-none focus:border-navy"
            />
          </div>
        </div>

        <div className="flex gap-1 rounded-md bg-tint/50 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("pdf")}
            className={`flex-1 rounded px-3 py-1.5 font-semibold transition ${
              mode === "pdf" ? "bg-surface text-ink shadow-sm" : "text-ink/50 hover:text-ink/70"
            }`}
          >
            Upload PDF
          </button>
          <button
            type="button"
            onClick={() => setMode("csv")}
            className={`flex-1 rounded px-3 py-1.5 font-semibold transition ${
              mode === "csv" ? "bg-surface text-ink shadow-sm" : "text-ink/50 hover:text-ink/70"
            }`}
          >
            Upload CSV
          </button>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={mode === "pdf" ? ".pdf,application/pdf" : ".csv,text/csv"}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setRows(null);
              setResult(null);
            }}
            className="w-full rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm outline-none file:mr-3 file:rounded file:border-0 file:bg-tint file:px-2.5 file:py-1 file:text-xs file:font-semibold"
          />
        </div>

        {!rows && (
          <button
            type="button"
            disabled={!file || isExtracting}
            onClick={handleExtract}
            className="w-full rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {isExtracting ? "Reading…" : "Extract line items"}
          </button>
        )}

        {error && <p className="text-sm text-crimson">{error}</p>}

        {rows && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-ink/40">
              {rows.length} line{rows.length === 1 ? "" : "s"} found — review before receiving
            </p>
            <div className="mt-2 space-y-1.5">
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border border-hairline bg-tint/20 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{row.partName}</p>
                    {row.partNumber && <p className="text-xs text-ink/50">#{row.partNumber}</p>}
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={row.quantity}
                    onChange={(e) => updateQty(i, Math.max(1, Number(e.target.value) || 1))}
                    className="w-16 flex-none rounded border border-hairline-strong px-2 py-1 text-sm outline-none focus:border-navy"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="flex-none text-xs font-medium text-ink/40 hover:text-crimson"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={isReceiving || rows.length === 0}
              onClick={handleConfirm}
              className="mt-4 w-full rounded-md bg-crimson px-4 py-2.5 text-sm font-semibold text-white hover:bg-crimson-bright disabled:opacity-50"
            >
              {isReceiving ? "Receiving…" : `Confirm receipt (${rows.length} line${rows.length === 1 ? "" : "s"})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
