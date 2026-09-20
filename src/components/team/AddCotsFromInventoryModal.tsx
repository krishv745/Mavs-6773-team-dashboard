"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addManualCotsLineAction } from "@/lib/bom/actions";
import { createSubsystemAction } from "@/lib/subsystems/actions";
import QuickAddPart from "@/components/team/QuickAddPart";

type PartOption = {
  id: string;
  name: string;
  part_number: string | null;
  location: string | null;
  qty_in_stock: number;
};

const NEW_SUBSYSTEM = "__new__";

export default function AddCotsFromInventoryModal({
  parts,
  subsystemId,
  projectId,
  subsystems,
}: {
  parts: PartOption[];
  /** Fixed subsystem (subsystem dashboard). Omit on the project dashboard. */
  subsystemId?: string;
  /** Needed on the project dashboard so a subsystem can be created inline. */
  projectId?: string;
  /** Project's subsystems — shown as a picker when there's no fixed subsystemId. */
  subsystems?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PartOption | null>(null);
  const [qty, setQty] = useState<number | "">("");
  const [subsystemChoice, setSubsystemChoice] = useState("");
  const [newSubsystemName, setNewSubsystemName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  // True once part + subsystem + quantity are all valid and "Add part" was
  // clicked — swaps the footer for the mark-collected-or-not choice instead
  // of submitting straight away.
  const [confirmStep, setConfirmStep] = useState(false);
  const [isPending, startTransition] = useTransition();

  const needsSubsystemChoice = !subsystemId;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parts.slice(0, 8);
    return parts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.part_number ?? "").toLowerCase().includes(q) ||
          (p.location ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [parts, query]);

  // How much of the requested quantity is actually on the shelf right now —
  // the rest lands on "COTS Parts (for purchase)" automatically, whichever
  // choice is picked below (0 on hand means the whole thing goes there).
  const onHand = selected ? Math.max(0, selected.qty_in_stock) : 0;
  const requested = qty === "" ? 0 : qty;
  const willCollect = Math.min(requested, onHand);
  const willOrder = requested - willCollect;

  function reset() {
    setQuery("");
    setSelected(null);
    setQty("");
    setSubsystemChoice("");
    setNewSubsystemName("");
    setError(null);
    setAddingNew(false);
    setConfirmStep(false);
  }

  /** "Add part" — validates, then swaps in the mark-collected-or-not choice. */
  function requestSubmit() {
    if (!selected || qty === "" || qty < 1) return;
    if (needsSubsystemChoice && !subsystemChoice) {
      setError("Pick a subsystem.");
      return;
    }
    if (subsystemChoice === NEW_SUBSYSTEM && !newSubsystemName.trim()) {
      setError("Name the new subsystem.");
      return;
    }
    setError(null);
    setConfirmStep(true);
  }

  function submit(markCollected: boolean) {
    if (!selected || qty === "" || qty < 1) return;
    setError(null);
    startTransition(async () => {
      let targetSubsystemId = subsystemId ?? "";
      if (!targetSubsystemId && needsSubsystemChoice) {
        if (subsystemChoice === NEW_SUBSYSTEM) {
          if (!newSubsystemName.trim() || !projectId) {
            setError("Name the new subsystem.");
            setConfirmStep(false);
            return;
          }
          const res = await createSubsystemAction(projectId, newSubsystemName.trim());
          if (res.error || !res.id) {
            setError(res.error ?? "Couldn't create that subsystem.");
            setConfirmStep(false);
            return;
          }
          targetSubsystemId = res.id;
        } else if (subsystemChoice) {
          targetSubsystemId = subsystemChoice;
        } else {
          setError("Pick a subsystem.");
          setConfirmStep(false);
          return;
        }
      }

      const res = await addManualCotsLineAction(targetSubsystemId, selected.id, qty, markCollected);
      if (res.error) {
        setError(res.error);
        setConfirmStep(false);
        return;
      }
      dialogRef.current?.close();
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md border border-hairline-strong bg-surface px-3 py-1.5 text-sm font-semibold text-ink/70 transition hover:bg-tint"
      >
        ＋ Add from inventory
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl p-0 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        onClose={reset}
      >
        <div className="p-6">
          <div className="flex items-start justify-between">
            <h2 className="font-display text-xl font-bold text-ink">
              {addingNew ? "Add a new part" : "Add a COTS part from inventory"}
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-ink/40 hover:text-ink/70"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {!selected ? (
              addingNew ? (
                <QuickAddPart
                  onCreated={(part) => {
                    setSelected({ ...part, location: null });
                    setAddingNew(false);
                  }}
                  onCancel={() => setAddingNew(false)}
                />
              ) : (
                <div>
                  <label htmlFor="cotsSearch" className="text-sm font-medium text-ink/80">
                    Search inventory
                  </label>
                  <input
                    id="cotsSearch"
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Name, part number, or location…"
                    className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm outline-none focus:border-navy"
                  />
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-hairline-strong">
                    <button
                      type="button"
                      onClick={() => setAddingNew(true)}
                      className="block w-full border-b border-hairline px-3 py-2 text-left text-sm font-semibold text-navy hover:bg-tint"
                    >
                      ＋ Add part
                    </button>
                    {results.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-ink/40">No parts match.</p>
                    ) : (
                      results.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelected(p)}
                          className="block w-full truncate px-3 py-2 text-left text-sm text-ink hover:bg-tint"
                        >
                          {p.name}
                          {p.part_number && <span className="text-ink/40"> · #{p.part_number}</span>}
                          {p.location && <span className="text-ink/40"> · {p.location}</span>}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )
            ) : (
              <div className="rounded-md border border-hairline-strong bg-tint/40 px-3 py-2 text-sm">
                <p className="font-medium text-ink">{selected.name}</p>
                {(selected.part_number || selected.location) && (
                  <p className="text-xs text-ink/50">
                    {selected.part_number && `#${selected.part_number}`}
                    {selected.part_number && selected.location && " · "}
                    {selected.location}
                  </p>
                )}
                <p className="text-xs text-ink/50">{onHand} in stock right now</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setConfirmStep(false);
                  }}
                  className="mt-1 text-xs font-medium text-navy hover:underline"
                >
                  Choose a different part
                </button>
              </div>
            )}

            {!addingNew && !confirmStep && needsSubsystemChoice && (
              <div>
                <label htmlFor="cotsSubsystem" className="text-sm font-medium text-ink/80">
                  Subsystem
                </label>
                <select
                  id="cotsSubsystem"
                  value={subsystemChoice}
                  onChange={(e) => setSubsystemChoice(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2 text-sm outline-none focus:border-navy"
                >
                  <option value="">Choose…</option>
                  {(subsystems ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value={NEW_SUBSYSTEM}>＋ New subsystem…</option>
                </select>
                {subsystemChoice === NEW_SUBSYSTEM && (
                  <input
                    value={newSubsystemName}
                    onChange={(e) => setNewSubsystemName(e.target.value)}
                    placeholder="New subsystem name"
                    className="mt-2 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm outline-none focus:border-navy"
                  />
                )}
              </div>
            )}

            {!addingNew && !confirmStep && (
              <div>
                <label htmlFor="cotsQty" className="text-sm font-medium text-ink/80">
                  Quantity
                </label>
                <input
                  id="cotsQty"
                  type="number"
                  min={1}
                  value={qty}
                  placeholder="0"
                  onChange={(e) => {
                    const v = e.target.value;
                    setQty(v === "" ? "" : Math.max(1, Math.round(Number(v) || 0)));
                  }}
                  className="mt-1.5 w-24 rounded-md border border-hairline-strong px-3 py-2 text-sm outline-none focus:border-navy"
                />
                <p className="mt-1 text-xs text-ink/50">
                  {selected && requested > 0
                    ? willOrder > 0
                      ? willCollect > 0
                        ? `${willCollect} from stock, ${willOrder} will need to be purchased.`
                        : "None in stock — this will go straight to COTS Parts (for purchase)."
                      : "Pulled from inventory stock into this subsystem now."
                    : "Pulled from inventory stock into this subsystem now."}
                </p>
              </div>
            )}

            {!addingNew && confirmStep && (
              <div className="rounded-md border border-hairline-strong bg-tint/40 px-3 py-2.5 text-sm">
                <p className="font-medium text-ink">How should this be added?</p>
                <p className="mt-0.5 text-xs text-ink/50">
                  {qty} × {selected?.name}
                  {willOrder > 0 &&
                    (willCollect > 0
                      ? ` — ${willCollect} in stock, ${willOrder} need${willOrder === 1 ? "s" : ""} to be purchased`
                      : " — none in stock, all of it needs to be purchased")}
                </p>
              </div>
            )}

            {!addingNew && error && <p className="text-sm text-crimson">{error}</p>}
          </div>

          {!addingNew && (
            <div className="mt-5 flex flex-col gap-2">
              {confirmStep ? (
                <>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => submit(true)}
                    className="w-full rounded-md bg-crimson px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-crimson-bright disabled:opacity-50"
                  >
                    {isPending ? "Adding…" : willCollect > 0 ? "✓ Mark as collected" : "✓ Confirm"}
                  </button>
                  {willCollect > 0 && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => submit(false)}
                      className="w-full rounded-md border border-hairline-strong px-4 py-2.5 text-sm font-semibold text-ink/70 transition hover:bg-tint disabled:opacity-50"
                    >
                      {isPending ? "Adding…" : "📋 Add to collection list"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setConfirmStep(false)}
                    className="mt-1 text-xs font-medium text-ink/50 hover:text-ink/80"
                  >
                    ← Back
                  </button>
                </>
              ) : (
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => dialogRef.current?.close()}
                    className="rounded-md px-4 py-2 text-sm font-medium text-ink/60 hover:bg-tint"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isPending || !selected || qty === "" || qty < 1}
                    onClick={requestSubmit}
                    className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-bright disabled:opacity-50"
                  >
                    Add part
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
