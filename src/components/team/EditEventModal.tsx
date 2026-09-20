"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { updateEventAction, createEventCategoryAction } from "@/lib/events/actions";
import { EVENT_VISIBILITY_ROLES } from "@/lib/roles";
import SubmitButton from "@/components/team/SubmitButton";
import RichTextField from "@/components/team/RichTextField";
import type { EventCategoryRow, UserRole } from "@/lib/supabase/types";

export type EditableRole = { id: string; name: string; slotsNeeded: number };

export default function EditEventModal({
  eventId,
  categories,
  hasFutureOccurrences,
  initial,
  roles,
}: {
  eventId: string;
  categories: EventCategoryRow[];
  hasFutureOccurrences: boolean;
  initial: {
    name: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    info: string | null;
    categoryId: string | null;
    visibleTo: UserRole[] | null;
  };
  roles: EditableRole[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(updateEventAction, undefined);
  const [scope, setScope] = useState<"this" | "series">("this");

  const [categoryList, setCategoryList] = useState(categories);
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? "");
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
        className="rounded-md border border-hairline-strong px-4 py-2 text-sm font-semibold text-ink/70 hover:bg-tint"
      >
        Edit event
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
            <h2 className="font-display text-xl font-bold text-ink">Edit event</h2>
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
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="scope" value={scope} />

            <div>
              <label htmlFor="e-name" className="text-sm font-medium text-ink/80">
                Event name
              </label>
              <input
                id="e-name"
                name="name"
                required
                defaultValue={initial.name}
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
              />
            </div>

            <div>
              <label htmlFor="e-categoryId" className="text-sm font-medium text-ink/80">
                Category
              </label>
              <select
                id="e-categoryId"
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
              <label htmlFor="e-date" className="text-sm font-medium text-ink/80">
                Date
              </label>
              <input
                id="e-date"
                name="date"
                type="date"
                required={scope === "this"}
                disabled={scope === "series"}
                defaultValue={initial.date}
                className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 disabled:bg-tint disabled:text-ink/40"
              />
              {scope === "series" && (
                <p className="mt-1 text-xs text-ink/40">
                  Each occurrence keeps its own date — only editable when applying to just this event.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="e-startTime" className="text-sm font-medium text-ink/80">
                  Start time
                </label>
                <input
                  id="e-startTime"
                  name="startTime"
                  type="time"
                  defaultValue={initial.startTime ?? ""}
                  className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                />
              </div>
              <div>
                <label htmlFor="e-endTime" className="text-sm font-medium text-ink/80">
                  End time
                </label>
                <input
                  id="e-endTime"
                  name="endTime"
                  type="time"
                  defaultValue={initial.endTime ?? ""}
                  className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                />
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-ink/80">Visible to</p>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {EVENT_VISIBILITY_ROLES.map((r) => (
                  <label key={r.value} className="flex items-center gap-1.5 text-sm text-ink/70">
                    <input
                      type="checkbox"
                      name="visibleTo"
                      value={r.value}
                      defaultChecked={!initial.visibleTo || initial.visibleTo.includes(r.value)}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink/40">Team Leads always see every event.</p>
            </div>

            <RichTextField name="info" label="Info" rows={3} defaultValue={initial.info ?? ""} />

            {roles.length > 0 && (
              <div>
                <p className="text-sm font-medium text-ink/80">Roles needed</p>
                <div className="mt-2 space-y-2">
                  {roles.map((role) => (
                    <div key={role.id} className="flex items-center gap-2">
                      <input type="hidden" name="roleId" value={role.id} />
                      <span className="w-full rounded-md border border-hairline-strong bg-tint px-3 py-2 text-sm text-ink/70">
                        {role.name}
                      </span>
                      <input
                        name="roleSlots"
                        type="number"
                        min={0}
                        defaultValue={role.slotsNeeded}
                        required
                        className="w-20 flex-none rounded-md border border-hairline-strong px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-ink/40">
                  Role names can&rsquo;t be changed here — add a new event if you need a different role set.
                </p>
              </div>
            )}

            {hasFutureOccurrences && (
              <div>
                <p className="text-sm font-medium text-ink/80">Apply to</p>
                <div className="mt-1.5 space-y-1.5">
                  <label className="flex items-center gap-2 text-sm text-ink/70">
                    <input
                      type="radio"
                      checked={scope === "this"}
                      onChange={() => setScope("this")}
                    />
                    This event only
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink/70">
                    <input
                      type="radio"
                      checked={scope === "series"}
                      onChange={() => setScope("series")}
                    />
                    This and all future events in the series
                  </label>
                </div>
              </div>
            )}

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
