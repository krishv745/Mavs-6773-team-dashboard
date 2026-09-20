"use client";

import { useRef, useTransition } from "react";
import { updateProjectColorAction } from "@/lib/tasks/actions";
import { PROJECT_COLOR_PALETTE } from "@/lib/projectColors";

export default function ProjectColorPicker({
  projectId,
  currentColor,
}: {
  projectId: string;
  currentColor: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();

  function pick(color: string) {
    startTransition(async () => {
      await updateProjectColorAction(projectId, color);
      dialogRef.current?.close();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        title="Change project color"
        aria-label="Change project color"
        className="h-4 w-4 flex-none rounded-full ring-2 ring-white ring-offset-1 ring-offset-hairline-strong transition hover:scale-110"
        style={{ backgroundColor: currentColor ?? PROJECT_COLOR_PALETTE[0] }}
      />

      <dialog
        ref={dialogRef}
        className="w-full max-w-xs rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h3 className="font-display text-base font-bold text-ink">Project color</h3>
        <p className="mt-1 text-xs text-ink/50">Used to tell this project apart on the timeline.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {PROJECT_COLOR_PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              disabled={isPending}
              onClick={() => pick(color)}
              aria-label={`Use color ${color}`}
              className={`h-8 w-8 rounded-full transition disabled:opacity-50 ${
                color === currentColor ? "ring-2 ring-ink ring-offset-2" : "hover:scale-110"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="mt-5 text-sm font-medium text-ink/60 hover:bg-tint"
        >
          Close
        </button>
      </dialog>
    </>
  );
}
