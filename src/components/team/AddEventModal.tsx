"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createEventAction, createEventCategoryAction } from "@/lib/events/actions";
import { EVENT_VISIBILITY_ROLES } from "@/lib/roles";
import SubmitButton from "@/components/team/SubmitButton";
import RichTextField from "@/components/team/RichTextField";
import type { EventCategoryRow } from "@/lib/supabase/types";

export default function AddEventModal({ categories }: { categories: EventCategoryRow[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(createEventAction, undefined);
  const [roles, setRoles] = useState([{ key: 0 }]);
  const nextRoleKey = useRef(1);
  const [repeatsWeekly, setRepeatsWeekly] = useState(false);

  const [categoryList, setCategoryList] = useState(categories);
  const [categoryId, setCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreatingCategory, startCreateCategory] = useTransition();

  useEffect(() => {
    if (state?.error) dialogRef.current?.showModal();
  }, [state]);

  function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    startCreateCategory(async () => {
      const result = await createEventCategoryAction(newCategoryName.trim());
      if (result.error || !result.id) return;
      setCategoryList((prev) => [...prev, { id: result.id!, name: result.name! }]);
      setCategoryId(result.id);
      setNewCategoryName("");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white transition hover:bg-crimson-bright"
      >
        + Add Event
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-xl p-0 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="flex items-start justify-between">
            <h2 className="font-display text-xl font-bold text-ink">Add Event</h2>
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
              <label htmlFor="name" className="text-sm font-medium text-ink/80">
                Event name
              </label>
              <input
                id="name"
                name="name"
                required
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>

            <div>
              <label htmlFor="categoryId" className="text-sm font-medium text-ink/80">
                Category
              </label>
              <select
                id="categoryId"
                name="categoryId"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-hairline-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              >
                <option value="">No category</option>
                {categoryList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex gap-2">
                <input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Or add a new category"
                  className="w-full rounded-md border border-hairline-strong px-3 py-2 text-sm outline-none focus:border-navy"
                />
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={isCreatingCategory}
                  className="flex-none rounded-md border border-hairline-strong px-3 py-2 text-xs font-semibold text-ink/70 hover:bg-tint disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="date" className="text-sm font-medium text-ink/80">
                Date
              </label>
              <input
                id="date"
                name="date"
                type="date"
                required
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="startTime" className="text-sm font-medium text-ink/80">
                  Start time
                </label>
                <input
                  id="startTime"
                  name="startTime"
                  type="time"
                  className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                />
              </div>
              <div>
                <label htmlFor="endTime" className="text-sm font-medium text-ink/80">
                  End time
                </label>
                <input
                  id="endTime"
                  name="endTime"
                  type="time"
                  className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-ink/80">
                <input
                  type="checkbox"
                  checked={repeatsWeekly}
                  onChange={(e) => setRepeatsWeekly(e.target.checked)}
                />
                Repeats weekly, same time
              </label>
              {repeatsWeekly && (
                <div className="mt-2">
                  <label htmlFor="repeatUntil" className="text-xs font-medium text-ink/60">
                    Until
                  </label>
                  <input
                    id="repeatUntil"
                    name="repeatUntil"
                    type="date"
                    required={repeatsWeekly}
                    className="mt-1 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                  />
                </div>
              )}
              <input type="hidden" name="repeatsWeekly" value={repeatsWeekly ? "true" : "false"} />
            </div>

            <div>
              <p className="text-sm font-medium text-ink/80">Visible to</p>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {EVENT_VISIBILITY_ROLES.map((r) => (
                  <label key={r.value} className="flex items-center gap-1.5 text-sm text-ink/70">
                    <input type="checkbox" name="visibleTo" value={r.value} defaultChecked />
                    {r.label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink/40">Team Leads always see every event.</p>
            </div>

            <RichTextField name="info" label="Info" rows={3} />

            <div>
              <p className="text-sm font-medium text-ink/80">Roles needed</p>
              <p className="mt-0.5 text-xs text-ink/50">
                e.g. &ldquo;Parent chaperones&rdquo; — 3, &ldquo;Setup crew&rdquo; — 5
              </p>
              <div className="mt-2 space-y-2">
                {roles.map((role, i) => (
                  <div key={role.key} className="flex gap-2">
                    <input
                      name="roleName"
                      placeholder="Role name"
                      required
                      className="w-full rounded-md border border-hairline-strong px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                    />
                    <input
                      name="roleSlots"
                      type="number"
                      min={1}
                      defaultValue={1}
                      required
                      className="w-20 flex-none rounded-md border border-hairline-strong px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                    />
                    <button
                      type="button"
                      onClick={() => setRoles((prev) => prev.filter((_, j) => j !== i))}
                      disabled={roles.length === 1}
                      className="flex-none rounded-md px-2 text-ink/40 hover:text-crimson disabled:opacity-30"
                      aria-label="Remove role"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRoles((prev) => [...prev, { key: nextRoleKey.current++ }])}
                className="mt-2 text-xs font-semibold text-navy hover:underline"
              >
                + Add another role
              </button>
            </div>

            {state?.error && (
              <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
            )}

            <SubmitButton>Add event</SubmitButton>
          </form>
        </div>
      </dialog>
    </>
  );
}
