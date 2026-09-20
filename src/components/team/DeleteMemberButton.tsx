"use client";

import { useRef } from "react";
import { deleteMemberAction } from "@/lib/admin/actions";

export default function DeleteMemberButton({ userId, name }: { userId: string; name: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deleteWithId = deleteMemberAction.bind(null, userId);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="text-xs font-medium text-crimson/70 hover:text-crimson hover:underline"
      >
        Delete account
      </button>

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl p-6 backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h3 className="font-display text-lg font-bold text-ink">Delete {name}&rsquo;s account?</h3>
        <p className="mt-2 text-sm text-ink/60">
          They&rsquo;ll lose access immediately. Tasks and logs they created stay, just without
          their name attached. This can&rsquo;t be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-md px-4 py-2 text-sm font-medium text-ink/60 hover:bg-tint"
          >
            Cancel
          </button>
          <form action={deleteWithId}>
            <button
              type="submit"
              className="rounded-md bg-crimson px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-bright"
            >
              Delete account
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
