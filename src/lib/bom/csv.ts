/**
 * Small RFC4180-style quoted-CSV parser. Onshape's BOM export quotes any
 * field containing a comma (part names routinely have one inside parens,
 * e.g. "1121 Series Low-Side U-Channel (9 Hole, 240mm Length)"), so a plain
 * `split(",")` silently misaligns columns on real exports.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Normalize line endings so \r\n / \r / \n all behave the same inside the parser.
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export type ParsedBomRow = {
  name: string;
  partNumber: string | null;
  vendorLink: string | null;
  quantity: number;
  material: string | null;
  color: string | null;
};

const URL_RE = /^https?:\/\//i;

/**
 * Maps Onshape's confirmed BOM export header row
 * (`Item,Name,Part number,Description,Quantity,Material`) to parsed rows.
 * There's no dedicated "vendor link" column — when a part has one, Onshape
 * puts the URL in Description instead, so that's only kept when it looks
 * like a URL. "- None -" is Onshape's literal string for no material, not a
 * real material name, so it's normalized to null like a blank cell.
 */
export function parseBomCsv(text: string): ParsedBomRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf("name");
  const partNumberIdx = header.indexOf("part number");
  const descriptionIdx = header.indexOf("description");
  const quantityIdx = header.indexOf("quantity");
  const materialIdx = header.indexOf("material");
  const colorIdx = header.indexOf("color");

  if (nameIdx === -1) {
    throw new Error("That CSV doesn't look like an Onshape BOM export — no \"Name\" column found.");
  }

  const parsed: ParsedBomRow[] = [];
  for (const cells of rows.slice(1)) {
    const name = cells[nameIdx]?.trim();
    if (!name) continue;

    const description = descriptionIdx >= 0 ? cells[descriptionIdx]?.trim() || null : null;
    const rawMaterial = materialIdx >= 0 ? cells[materialIdx]?.trim() || null : null;
    const material = !rawMaterial || rawMaterial.toLowerCase() === "- none -" ? null : rawMaterial;
    const rawQty = quantityIdx >= 0 ? Number(cells[quantityIdx]) : 1;
    const quantity = Number.isFinite(rawQty) && rawQty > 0 ? Math.round(rawQty) : 1;
    const rawColor = colorIdx >= 0 ? cells[colorIdx]?.trim() || null : null;
    const color = !rawColor || rawColor.toLowerCase() === "- none -" ? null : rawColor;

    parsed.push({
      name,
      partNumber: partNumberIdx >= 0 ? cells[partNumberIdx]?.trim() || null : null,
      vendorLink: description && URL_RE.test(description) ? description : null,
      quantity,
      material,
      color,
    });
  }

  return parsed;
}

export type ParsedVendorOrderRow = {
  partName: string;
  partNumber: string | null;
  link: string | null;
  quantity: number;
};

/**
 * Vendor order CSVs have no fixed export format (unlike Onshape's BOM
 * export) — this accepts a handful of common header spellings rather than
 * one exact set.
 */
export function parseVendorOrderCsv(text: string): ParsedVendorOrderRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const findCol = (candidates: string[]) => candidates.map((c) => header.indexOf(c)).find((i) => i >= 0) ?? -1;

  const nameIdx = findCol(["part name", "name", "item", "description"]);
  const partNumberIdx = findCol(["part number", "sku", "part #", "number"]);
  const linkIdx = findCol(["link", "url", "product link"]);
  const qtyIdx = findCol(["qty ordered", "qty", "quantity"]);

  if (nameIdx === -1) {
    throw new Error("That CSV doesn't look like a vendor order export — no name/part column found.");
  }

  const parsed: ParsedVendorOrderRow[] = [];
  for (const cells of rows.slice(1)) {
    const partName = cells[nameIdx]?.trim();
    if (!partName) continue;
    const rawQty = qtyIdx >= 0 ? Number(cells[qtyIdx]) : 1;
    parsed.push({
      partName,
      partNumber: partNumberIdx >= 0 ? cells[partNumberIdx]?.trim() || null : null,
      link: linkIdx >= 0 ? cells[linkIdx]?.trim() || null : null,
      quantity: Number.isFinite(rawQty) && rawQty > 0 ? Math.round(rawQty) : 1,
    });
  }

  return parsed;
}
