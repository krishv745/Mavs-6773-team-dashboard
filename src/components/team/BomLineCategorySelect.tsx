"use client";

import { useTransition } from "react";
import { updateBomLineCategoryAction } from "@/lib/bom/actions";
import { BOM_CATEGORY_LABEL, type BomCategory } from "@/lib/onshape/materialCategories";

const OPTIONS: BomCategory[] = ["order", "3d_print", "custom_cut"];

export default function BomLineCategorySelect({ lineId, category }: { lineId: string; category: BomCategory }) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={category}
      disabled={isPending}
      onChange={(e) => {
        const value = e.target.value as BomCategory;
        startTransition(async () => {
          await updateBomLineCategoryAction(lineId, value);
        });
      }}
      className="rounded-md border border-hairline-strong bg-surface px-2 py-1 text-xs font-medium text-ink outline-none focus:border-navy disabled:opacity-50"
    >
      {OPTIONS.map((c) => (
        <option key={c} value={c}>
          {BOM_CATEGORY_LABEL[c]}
        </option>
      ))}
    </select>
  );
}
