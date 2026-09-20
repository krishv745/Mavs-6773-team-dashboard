# Phase 8 — Onshape BOM import: full order → collect → build → reconcile pipeline

This is one phase pulled out of the full `TEAM-APP-UPDATES.md` plan, standalone so it can be
handed to Claude Code as its own focused session. It assumes the rest of that plan's earlier
phases (crash fix, delete actions, Build/Parts polish, etc.) are already built — which they are,
per the project's git history — so this file only covers what's new/changed here.

**Point Claude Code at this file directly** — e.g. "Read PHASE-8-BOM-PIPELINE.md and let's build
this." Work through the steps in order, run `npm run dev` and actually click through each step
before moving to the next, and commit after each working step rather than all at once.

**Two real test fixture files ship with this phase** — `test-fixtures/sample-bom.csv` (an actual
Onshape BOM CSV export) and `test-fixtures/sample-vendor-invoice.pdf` (an actual goBILDA order
page saved as PDF). They're referenced throughout the steps below (they're what confirmed the
real CSV column names and surfaced a few real edge cases) and used in the Testing section at the
end — make sure both files exist in the repo before starting.

---

## Naming heads-up (this trips up both humans and Claude Code)
There are two unrelated things called "project" in this codebase:
- `task_projects` — the **Projects tab** in the app nav (things like "V1", "Clubhouse Outreach").
  Not what this phase is about.
- `projects` — the **Build tab's** allocation buckets (e.g. "Prototyping", "V1") that parts get
  scanned into. **This** is what this phase is about — every `project_id` reference below means
  this table.

A project named "V1" can exist in both tables and it's a coincidence, not a link. Keep them
separate throughout.

---

## One-time setup this phase needs: `ANTHROPIC_API_KEY`
Steps 1 and 5 below both call the Claude API (via `@anthropic-ai/sdk`, already a dependency in
`package.json`) to extract structured data from a fetched web page and from an uploaded PDF. Add
an `ANTHROPIC_API_KEY` to `.env.local` and to Vercel's env vars (same pattern as the Supabase keys
documented in `TEAM-APP-SETUP.md`) before starting Step 1. One shared key, most naturally billed
to Krish — there's no way for individual team members to use their own personal claude.ai/Pro
account for this (that's a different product from the API, with separate billing). Cost-wise this
is a non-issue compared to what burned through the Onshape API allowance: these are small,
structured extraction calls, worth capping at a cheap/fast model tier rather than the most
expensive one, since "pull line items off an invoice" doesn't need top-tier reasoning.

---

## Why
This is new functionality on top of the Build tab's existing `projects` / `parts` /
`part_allocations` / `scan_events` model. This isn't a single feature so much as a full lifecycle
for one robot version's parts: bring in the BOM, figure out what's missing, physically
gather/build everything, track it as it arrives and gets installed, and eventually get it all back
into general stock when that version gets torn down. Laid out below as six steps, each buildable
and testable on its own, in order.

**No Onshape API.** Krish has already used up the Onshape API token/credit allowance, so this does
not call Onshape's official API at all, live or otherwise. Instead there are two fully web-based
ways a BOM gets in, both handled inside the deployed app itself (no local terminal step required
for either):
- **CSV upload** — Onshape can export any assembly's BOM to CSV from its own UI (no API involved,
  just a manual export Krish or a teammate does in Onshape and downloads, then uploads here).
  Always available, works for any document regardless of sharing settings, and is the fallback if
  the link-based path below ever misreads something.
- **Paste an Onshape document link** — the server fetches that page directly (a plain HTTP fetch,
  the same way `fetchLinkMetadataAction` already fetches vendor links in `parts/actions.ts` — no
  Onshape API call, no OAuth) and hands the fetched content to Claude with a structured-extraction
  prompt to pull out BOM rows — same technique as the vendor-order-PDF extraction in Step 5, just
  against fetched HTML instead of PDF text. **This only works for a document Onshape is showing to
  an unauthenticated visitor** — the server has no logged-in Onshape session, so the document has
  to be set to "Public" or "Anyone with the link can view" in Onshape's own share settings first.
  That's a one-time setting on Krish's end, not something Claude Code can code around — worth
  surfacing as an inline error ("couldn't read that document — check it's shared publicly in
  Onshape") if the fetch comes back looking like a login page instead of document content.

---

## Step 0 — Remove what this replaces
The live-Onshape-API BOM import (and the two generic "scan anything into/out of a project" entry
points from the original spec) already got built in an earlier session — so this phase starts by
removing three things that are being superseded, not just adding new ones. Do this removal *as
part of* building the steps below, not as a separate cleanup pass, so there's never a moment with
two competing ways to do the same thing.

- **The live Onshape API integration is what's being replaced — remove it entirely, it's the
  thing burning API tokens Krish no longer has:**
  - Delete `src/lib/onshape/client.ts` (the Onshape REST client/auth) and `src/lib/onshape/bom.ts`
    (parses Onshape's proprietary BOM JSON response shape — not reusable for CSV/text parsing,
    that's new code in Step 1).
  - Delete `src/app/api/onshape/bom-stl/route.ts` (STL zip download) — it depends entirely on live
    API access to pull part geometry, so it can't survive this change. This is a real feature loss
    worth flagging to Krish explicitly, not silently dropping: auto-downloading STLs for the
    3D-print bucket goes away unless/until Onshape API access comes back.
  - In `src/lib/onshape/actions.ts`, remove `fetchOnshapeBomAction` (calls the live API). Keep the
    general shape of `importBomAction` — the part that writes *reviewed, confirmed* rows into
    `parts`/`part_allocations` — since that write logic doesn't actually care where the rows came
    from; just repoint it at the new CSV/link-sourced `bom_lines` from Step 1 instead of live
    Onshape rows.
  - **Keep `src/lib/onshape/materialCategories.ts` as-is** — `categorizeMaterial` and
    `BOM_CATEGORY_LABEL` are plain material-name logic with no Onshape API dependency, and it's
    already built exactly the way Step 2 below needs it (including the "3d_print" / "custom_cut" /
    "order" category names — use those names, not new ones, so nothing else needs renaming).
  - Remove the `ONSHAPE_ACCESS_KEY` / `ONSHAPE_SECRET_KEY` / `ONSHAPE_BASE_URL` env vars once
    nothing references them.
  - Rework `ImportBomModal.tsx` into the two-input-mode importer described in Step 1 (CSV upload
    or pasted Onshape link) — its existing "fetch → grouped review table → confirm" shape is worth
    keeping, just swap what feeds it.
- **Remove the two generic Build-page scan entry points** — the "📥 Add Part Back To Inventory
  (scan)" (`/team/build/scan?mode=add`) and "📤 Add Parts To Project" (`/team/build/scan?mode=remove`)
  links in `build/page.tsx`. Free-form "scan anything into or out of any project, unscoped" is
  what Steps 4 and 6 below replace with structured, BOM-import-scoped and
  disassembly-session-scoped versions.
  - **Do not delete the scanning engine itself** — `ScannerFlow.tsx`, and `scanAction` /
    `undoScanAction` in `parts/actions.ts`, are what Step 4's scan checklist and Step 6's
    disassembly flow are built on top of. Only the two unscoped entry points on the Build page go
    away; the barcode-scanning UI and the underlying scan/undo actions get reused, just launched
    from the new scoped flows (a specific `bom_import`'s checklist, a specific
    `disassembly_session`) instead of a generic "pick a project and start scanning" button.

---

## Step 1 — Bring in the BOM
- New page/section on the Build tab: "Import BOM" → pick which `project` this is for (e.g. "V1")
  → either upload a CSV **or** paste an Onshape document link — one form, two input modes, same
  result either way (a set of parsed `bom_lines`).
- **CSV path — confirmed against a real Onshape export** (`test-fixtures/sample-bom.csv`, see
  Testing below): the actual header row is `Item,Name,Part number,Description,Quantity,Material`.
  Two things that aren't what you'd guess:
  - There's no separate "vendor link" column — when a part has one, Onshape puts the URL in the
    **Description** column (see row 19 in the sample: `Description` is
    `https://www.gobilda.com/1121-series-low-side-u-channel-...`). Map `vendor_link` from
    `Description`, not from a column that doesn't exist.
  - `Material` is very often the literal string `- None -`, not blank — normalize that to `null`
    on parse (treat it exactly like an empty material), don't let it fall through as if `"- None -"`
    were a real material name.
  - Don't hard-fail on missing `Part number`/`Description` — the sample file has plenty of rows
    with both blank (custom/fabricated parts that were never linked to a vendor in CAD).
- **Link path:** fetch the document URL server-side, extract the page's text content, and send it
  to Claude with a structured-extraction prompt asking for the same shape — name, quantity,
  material, vendor link/part number where present. If the fetch looks like an Onshape login page
  rather than document content, stop and surface the "share this document publicly first" error
  from above instead of sending a login page to Claude.
- **Either path lands on the same review screen before anything is saved** — every extracted/parsed
  row shown as an editable table, since both a messy CSV export and an AI-read BOM page can get a
  row wrong. Nothing in Step 2 or beyond runs until this is confirmed.
- New table `bom_imports` (`id`, `project_id` → `projects`, `source` — `csv` or `onshape_link`,
  `source_ref` — filename or the pasted URL, `imported_by`, `imported_at`, `status` — `draft`
  while being reviewed, `confirmed` once Step 2's categorization is approved) and `bom_lines`
  (`id`, `bom_import_id`, `name`, `part_number`, `material`, `vendor_link`, `qty_needed`,
  `category`, `matched_part_id` nullable FK to `parts`). Keep the raw parsed rows in `bom_lines`
  even before categorization is confirmed, so a bad import can be reviewed/discarded without
  re-uploading or re-fetching.

---

## Step 2 — Classify every line
- For each `bom_line`, decide which bucket it belongs in — reuse `categorizeMaterial` from
  `materialCategories.ts` (already built, already has your real material list mapped in) rather
  than writing new categorization logic:
  - **3D Print** (`3d_print`) — material is PETG (or whatever's in your printer material list).
  - **Custom Cut** (`custom_cut`) — material/method indicates aluminum or CO2-laser-cut stock
    (aluminum plate, Delrin, plywood/acrylic for the laser — whatever's in the existing map).
  - **Order** (`order`) — everything else (off-the-shelf hardware, GoBilda/vendor components) —
    this bucket is what Step 3 compares against inventory. This is also `categorizeMaterial`'s
    existing safe default for anything with no material or an unrecognized one — no separate
    "needs review" bucket needed, since falling through to Order (a human just orders/checks it
    manually) is already the sensible default the existing logic uses.
  - The `{ match, category }` list inside `materialCategories.ts` is already the "edit this table
    when materials change" mechanism — no new admin UI/table needed for this unless Krish
    specifically wants it moved into a settings screen later.
  - `categorizeMaterial(material, hasLinkedMatch)` takes a second argument that downgrades a
    would-be Custom Cut material to Order when the row already has a purchase link — **wire this
    up in Step 2**, passing `hasLinkedMatch = Boolean(bom_line.part_number ||
    bom_line.vendor_link)` per row. Skipping this argument (passing `false`/nothing) will
    misclassify real purchased aluminum parts as fabricate-in-house.
- **The review screen isn't optional polish — the real sample BOM shows exactly why.** Small
  hardware like `5203 Shaft`, `Roller Pin`, `IR`, `OR`, `Roller Shim`, and `Roller E-Clip` in
  `test-fixtures/sample-bom.csv` all carry `Material: 300 Series Stainless Steel` with **no**
  `Part number`/`Description` filled in — because the CAD file's author never linked them to a
  vendor, not because they're actually meant to be fabricated in-house. Since "steel" matches the
  Custom Cut rule and there's no link to trigger the downgrade, these come out of categorization
  as **Custom Cut** even though they're genuinely purchasable GoBilda hardware. That's a
  data-hygiene gap in the Onshape file, not something to "fix" in code — the review screen (with
  an easy re-bucket-to-Order action per line) is the actual mitigation, so build it expecting real
  BOMs to need this kind of manual correction regularly, not as a rare edge case.
- Show all three buckets as an editable review screen (not an instant auto-write) — staff can
  re-categorize any individual line before confirming, since material-name guessing will
  occasionally be wrong.

---

## Step 3 — Compare purchased parts against inventory
- For every **Order**-bucket line only (3D Print / Custom Cut lines skip this — they're built
  fresh, not pulled from stock), try to match it to an existing `parts` row — by `part_number`
  first, falling back to `vendor_link`, falling back to a fuzzy name match staff confirms
  manually. **Part number must win over name similarity, always** — the real sample data has a
  concrete near-miss: the BOM needs `3417-4008-0016` ("...Pulley (8mm REX Bore, 16 Tooth)") while
  a real vendor order for this project might contain `3417-4008-0024` (the 24-tooth variant) —
  nearly identical names, different SKU, not interchangeable. A name-first matcher would wrongly
  treat these as the same part; a part-number-first matcher won't.
  - **Match found, enough stock** → goes on the **Collect from inventory** list for `qty_needed`.
  - **Match found, partial stock** → split automatically: `qty_in_stock` worth goes to *Collect*,
    the shortfall goes to *Order*.
  - **No match, or match with zero stock** → full `qty_needed` goes on the **Order** list.
- On confirm, this produces four concrete lists for the project: **Order**, **Collect from
  inventory**, **3D Print**, **Custom Cut** — each with quantities, and each `bom_line` gets a
  `status` (`pending` → moves through the steps below).

---

## Step 4 — Physical collection + the scan-in checklist
- This is where it becomes a checklist instead of just a report. Every confirmed `bom_line` — not
  just the "Collect" ones — ends up needing to physically land in this project's allocation
  eventually: *Collect* lines get pulled from the shelf, *3D Print*/*Custom Cut* lines get
  fabricated, *Order* lines arrive later (Step 5). In every case, the actual moment a part joins
  the robot is a **scan**, using the barcode flow that already exists (`scanAction`, mode
  `"remove"`, tied to this project) — reuse it exactly as-is rather than building a second write
  path.
- For **Collect** lines: the existing barcode is already on the part in inventory (or gets printed
  now via the existing bulk-print feature) — staff pulls it and scans it in like any other
  part-to-project removal.
- For **3D Print** / **Custom Cut** lines: these usually won't exist as `parts` rows yet (they're
  new geometry, not a catalog item). On import confirm, auto-create a `parts` row for each one
  (name + material from the BOM line, `qty_in_stock: 0`, a fresh generated barcode) so there's
  something to print a label for and scan once it comes off the printer/laser — matching by
  name+material against prior imports first so re-importing an updated BOM doesn't create
  duplicate catalog entries for the same part. **Only auto-merge this way when the line has no
  `part_number`.** The real sample BOM is full of unrenamed default Onshape names — `Part 1`,
  `Part 2`, `part1`, repeated dozens of times across completely unrelated parts — so a
  name+material match on these would silently merge unrelated geometry into one catalog entry.
  Safer default: treat every no-part-number line as its own new `parts` row (no auto-merge at
  all) and let staff manually merge duplicates from the review screen if they spot real ones,
  rather than risk silently conflating different parts that happen to share Onshape's placeholder
  name.
- Build a single "Scan checklist" view per `bom_import`: every line, its category, its status (not
  started / collected / ordered / fabricated / scanned in), so at a glance staff can see what's
  still outstanding for this version — this is the answer to "there should be a list of all the
  parts that need to be scanned into that specific project."

---

## Step 5 — Vendor order receiving (PDF or CSV) — auto-allocates straight to the project
Unlike Step 4's "everything gets scanned" rule, a received order skips the scan step — receiving
the order **is** the confirmation. Parts that were ordered *for* this BOM/project allocate
straight to it; anything extra in the same order lands in general inventory instead.

- **Input:** upload either a CSV, or a PDF of the order/invoice (a GoBilda order confirmation,
  etc.) — self-populating the line items from the PDF rather than requiring Krish to hand-type
  them. PDF text layout varies a lot vendor to vendor, so don't hand-write a regex parser per
  vendor: extract the PDF's text (`pdf-parse` or similar) and send it to Claude with a structured
  extraction prompt — "here's the raw text of a vendor order, return the line items as
  {part_name, part_number, qty_ordered, unit_price}" — using the same `ANTHROPIC_API_KEY` set up
  above. Always show the extracted lines on an editable review screen before anything gets
  written — a misread line item is a real risk with any PDF extraction, structured or not, so
  nothing auto-commits. `test-fixtures/sample-vendor-invoice.pdf` is a good first real-world test
  of this — see Testing below, it's not a clean formatted invoice, it's a saved account page full
  of extra noise the extraction needs to ignore.
- New tables: `vendor_orders` (`id`, `vendor`, `order_reference`, `bom_import_id` nullable FK —
  set when this order exists to fulfill a specific BOM's shortfall, left null for a general
  restock order, `imported_by`, `imported_at`) and `vendor_order_lines` (`id`, `vendor_order_id`,
  `part_name`, `part_number`, `link`, `qty_ordered`, `matched_part_id`).
- **Allocation logic on confirm**, per line, matched to inventory the same way as Step 3 (part
  number → link → manual match):
  1. If `vendor_orders.bom_import_id` is set, look up that part's outstanding "to order" quantity
     on its matching `bom_line` for that project.
  2. Allocate `min(qty_ordered, outstanding_needed)` **directly into `part_allocations` for that
     project** (bypassing the scan step) and reduce the `bom_line`'s outstanding-to-order amount
     by the same. Mark that `bom_line` fulfilled once its outstanding amount hits zero.
  3. Any remainder — the whole `qty_ordered` if the order wasn't tied to a BOM, or just the
     leftover past what the project needed — adds to that part's `qty_in_stock` in general
     inventory instead.
- If a line doesn't match any existing part, create a new `parts` row for it first (same as Step 4
  does for fabricated parts) before applying the allocation logic above.

---

## Step 6 — V1 teardown: return parts to inventory with reconciliation
- New "Disassemble project" flow on a project (once a robot version is retired): pulls the
  project's current `part_allocations` as the **expected return list** — this already exists in
  the schema, no new source of truth needed here.
- New `disassembly_sessions` table (`id`, `project_id`, `started_by`, `started_at`,
  `completed_at`) — opening one starts the checklist; the expected list is computed live from
  `part_allocations` at that moment.
- As parts come off the robot, staff scans them back using the **existing** `scanAction` "add"
  mode for that project (already decrements the project's allocation and increments
  `qty_in_stock` — no new scan logic needed, just a UI screen wrapping it in a checklist with a
  running "12 of 18 expected parts returned" counter).
- When staff marks the session complete, diff the original expected list against what actually got
  scanned back: anything with `part_allocations.qty > 0` remaining is missing. Show that as a
  **discrepancy report** (part name, qty missing) rather than silently zeroing it out — this is
  the "verify if all of the parts are still there" check. Let staff either keep looking (leave the
  session open) or close it out with the shortfall logged as a note on the session, so the
  inventory ends up accurate and there's a record of what came up short on that teardown.

---

## Testing this phase

Two real files to test against, saved in the repo at `test-fixtures/sample-bom.csv` and
`test-fixtures/sample-vendor-invoice.pdf` — an actual Onshape BOM CSV export and an actual goBILDA
order page saved as PDF, not synthetic examples. Everything below is a manual click-through
checklist (matching how the rest of this project gets tested — `npm run dev` and actually use it),
since there's no automated test runner in this project yet (no Jest/Vitest in `package.json`).
Adding Vitest to unit-test the pure-logic pieces (`categorizeMaterial`, the CSV/PDF row parsers,
the part-matching function) would be a reasonable bonus given how easy these are to get silently
wrong — worth doing if there's time, but the manual checklist below is what actually has to pass.

**Test 1 — Import the BOM and check categorization.** Create a test project (e.g. "Test — V1"),
import `test-fixtures/sample-bom.csv`, and check the review screen before confirming:
- Real GoBilda catalog parts with a part number *and* link — e.g. "1309 Series Sonic Hub"
  (`1309-0016-4008`, Aluminum) — should land in **Order**, not Custom Cut, proving the
  `hasLinkedMatch` downgrade from Step 2 is actually wired up.
- Small hardware with no part number/link but a steel material — "5203 Shaft", "Roller Pin",
  "IR", "OR", "Roller Shim", "Roller E-Clip" — will land in **Custom Cut**. That's expected (see
  Step 2's note on why) — confirm the review screen lets you re-bucket each one to Order in a
  couple of clicks, and that the change actually sticks through to confirm.
- Rows with `Material` as the literal text `- None -` (most of the fabricated/custom parts in this
  file) should be treated as no-material, landing in **Order** by the safe-default rule — not
  matched against anything by the literal string `"- none -"`.
- Repeated generic names ("Part 1", "Part 2", "part1", appearing dozens of times for unrelated
  geometry) should each become their **own** `parts` row on confirm — not silently merged into one
  catalog entry because the names collide.

**Test 2 — Order vs. Collect split.** Before importing, manually add a `parts` row matching one
BOM line's part number (e.g. `1504-0032-0040`, needed qty 10) with some stock on hand, say 4. Run
the import and confirm that line splits automatically: 4 on the **Collect from inventory** list, 6
on the **Order** list — not all 10 on one or the other.

**Test 3 — the actual order → cross-check → allocate flow (this is the main one).** The two
sample files share a real part: **`1205-0001-0005`** ("1205 Series Dual Block Mount (1-5) - 2
Pack"). The BOM needs **4**; the sample invoice contains a line for **12**.
1. Import `sample-bom.csv` into the test project with zero `1205-0001-0005` in stock beforehand —
   confirm it lands on the **Order** list needing 4.
2. Go to "Receive order," tie it to this same BOM import/project, and upload
   `test-fixtures/sample-vendor-invoice.pdf`. Verify the extracted line items match the PDF's
   actual content (12 × 1205 Series Dual Block Mount, SKU `1205-0001-0005`, among the other
   unrelated lines in that order) — and that extraction isn't thrown off by the surrounding noise
   in this particular PDF: it's a saved account order-history *page*, not a formatted invoice, so
   it's full of nav menu text ("Orders / Returns / Addresses / Payment Methods / Wish Lists..."),
   Krish's and his mom's home addresses, a tracking number, and totals mixed in with the actual
   line items. A good extraction prompt needs to hold up against exactly this kind of page, not
   just a clean invoice layout.
3. Confirm the receipt. Check the result: **4 units allocate directly into the test project's
   `part_allocations`** (fulfilling the BOM line, marking it fulfilled) and the **remaining 8 land
   in general `parts.qty_in_stock`** — this is the actual "cross-check what's needed for the
   version vs. the main dashboard" behavior, verified end to end with real numbers instead of
   guessed ones.

**Test 4 — part-number discipline, not name similarity.** The invoice also contains
`3417-4008-0024` ("...Pulley (8mm REX Bore, **24** Tooth)"), while the BOM needs
`3417-4008-0016` (the **16**-tooth variant) — nearly identical names, different part, not
interchangeable. Confirm the matcher does not treat the invoice line as fulfilling the BOM's need
for the 16-tooth pulley — if it does, Step 3/Step 5's matching is going by name instead of part
number and needs fixing before this ships.

---

## Open items before/while Claude Code works through this
- The BOM CSV column names are now confirmed against a real export (Step 1) — no longer an open
  question.
- Vendor order PDFs will still vary layout-to-layout across different vendors — the sample tested
  here is one real goBILDA page, useful as a first regression check, but don't assume every future
  vendor's PDF/invoice will extract as cleanly; keep the review-before-write screen non-negotiable
  for exactly this reason.
