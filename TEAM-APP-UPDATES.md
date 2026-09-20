# Tech Titans 25783 — `/team` App Update Plan

Written after reviewing the live codebase (git history, `CLAUDE.md`, `supabase/schema.sql`, and
the relevant source files) against the list of fixes/features Krish wants. This is meant to be
read by Claude Code the same way `CLAUDE.md` was for the original build: work through it one
phase at a time, in order, testing and committing after each phase before moving to the next.

**Scope note:** the public marketing site (`friscochsrobotics.org`) is not in scope — everything
below is the `/team` login page and the app behind it.

**Naming heads-up (this trips up both humans and Claude Code):** there are two unrelated things
called "project" in this codebase:
- `task_projects` — the **Projects tab** in the app nav (things like "V1", "Clubhouse Outreach").
  This is what the timeline feature (Phase 5) is about.
- `projects` — the **Build tab's** allocation buckets (e.g. "Prototyping", "V1") that parts get
  scanned into. This is what the Onshape BOM feature (Phase 8) is about.

A project named "V1" can exist in both tables and it's a coincidence, not a link. Keep them
separate in every phase below.

---

## Suggested order

1. Fix the multi-user crash (Phase 0) — this is actively breaking the app during meetings, so it
   goes first regardless of how "boring" it is.
2. Fix the clock time zone bug (Phase 1) — small, isolated, high-value.
3. Add delete for tasks/projects/events (Phase 2) — small, low-risk, admin-only.
4. Login page bugs + redesign (Phase 3).
5. Build/Parts polish: images, location dropdown, bulk label printing (Phase 4).
6. Projects timeline feature (Phase 5).
7. Owner-only clock log deletion (Phase 6).
8. Custom roles & granular permissions (Phase 7) — biggest architectural change, do it once
   everything above is stable so it's not competing with other in-flight changes.
9. Onshape BOM import (Phase 8) — needs the `ANTHROPIC_API_KEY` env var set up (see Phase 9) since
   both its link-import and PDF order-parsing lean on the Claude API now.
10. AI chat assistant (Phase 9) — saved for last since it should call the same server actions
    everything else uses, so those need to already be solid (including the new delete/role ones).

Each phase below has a **Why / what's actually happening** section (grounded in the real code,
not a guess) and a **Build this** section Claude Code can work from directly.

---

## Phase 0 — Fix the crash at ~5+ concurrent users

### Why / what's actually happening
`middleware.ts` runs on every single request under `/team/*` (every page load, every nav click,
every server action). Look at `src/lib/supabase/middleware.ts` — on every one of those requests,
it does up to **four or five sequential, blocking Supabase round-trips**, one after another:

1. `supabase.auth.getUser()`
2. `select role, must_reset_password from users`
3. `select id, last_seen_at from clock_sessions where clock_out is null`
4. (conditionally) an admin update to `clock_sessions`
5. `select id from clock_sessions where auto_clocked_out and not catch_up_resolved`

None of these run in parallel — they're all `await`ed one after another. With one person on the
site that's invisible. With 5+ people all clicking around during a meeting, every one of those
navigations is queued behind this same waterfall, and it compounds fast — this is almost
certainly the actual cause of the crashes/errors, not raw traffic volume. The `ClockHeartbeat`
(60s ping) and `AppHeader`'s 30s local timer tick are comparatively cheap and not the bottleneck —
don't spend the fix budget there.

### Build this
- **Parallelize** the independent queries in `updateSession()` with `Promise.all` instead of
  sequential `await`s — the profile lookup, the open-session lookup, and (once fetched) the
  pending-catch-up lookup don't depend on each other and can run together.
- **Stop hitting the DB for `role`/`must_reset_password` on every request.** Set these as claims
  in a short, signed cookie at login (or read them from the Supabase JWT's custom claims if using
  Supabase Auth Hooks) and only re-fetch from `users` when that cookie is missing/stale — not on
  every navigation.
- **Throttle the abandoned-session / catch-up checks.** They only need to run every minute or so
  (matching `HEARTBEAT_REFRESH_MINUTES`), not on every request — gate them behind a cheap
  "last checked" cookie timestamp so a burst of navigations in the same minute skips straight
  through.
- Once deployed, watch Supabase's dashboard (Database → Reports, or Logs → Postgres) during a
  real multi-person session to confirm request latency/row reads actually dropped — if it's still
  spiking, check Supabase's plan-level connection/rate limits next (free tier has real ceilings),
  but the waterfall above is the first and most likely fix.
- Don't change the heartbeat/tick intervals as a "fix" for this — they're not what's causing the
  crash, and heartbeat intentionally ignores tab visibility on purpose (see the comment in
  `ClockHeartbeat.tsx`) to distinguish "backgrounded" from "actually closed" for auto-clock-out.
  Changing that would break auto clock-out, not fix the crash.

---

## Phase 1 — Fix clock in/out time zone display

### Why
Every place a clock time gets displayed — `log/page.tsx`, `admin/reports/page.tsx`,
`catch-up-log/page.tsx`, `projects/[projectId]/page.tsx`, etc. — calls `.toLocaleString()` /
`.toLocaleTimeString()` / `.toLocaleDateString()` with no `timeZone` option. Timestamps are stored
correctly in the database as UTC (`new Date().toISOString()` in `clock.ts` is right), but these
are **Server Components** rendering on Vercel's servers (which run in UTC), so the "local" time
formatting is happening in the server's time zone, not Central — not the visitor's browser. That's
why times come out shifted and look wrong, especially around day boundaries.

### Build this
- Add one shared helper, e.g. `src/lib/formatTime.ts`, that always formats with
  `timeZone: "America/Chicago"` explicitly (e.g. via `Intl.DateTimeFormat`), and export a couple
  of small wrappers (`formatClockTime`, `formatClockDateTime`, `formatShortDate`, etc.) instead of
  calling `.toLocaleString()`/`.toLocaleDateString()` directly everywhere.
- Replace every raw `.toLocaleString()`/`.toLocaleTimeString()`/`.toLocaleDateString()` call listed
  above (search the codebase — there are about a dozen call sites across `log`, `admin/reports`,
  `catch-up-log`, `events`, `projects`, `tasks/actions.ts`) with the shared helper.
- Double check `America/Chicago` (not a fixed `-05:00`/`-06:00` offset) so daylight saving shifts
  are handled automatically.

---

## Phase 2 — Delete tasks, projects, and events

### Why
`src/lib/tasks/actions.ts` has create/update/archive/unarchive/approve/reject for tasks, and
create/update-deadline for `task_projects` — but no delete for either. `src/lib/events/actions.ts`
has create/update but no delete either. The good news: the schema already cascades correctly
(`tasks.project_id` and `event_roles`/`event_volunteers` are all `on delete cascade`), so this is
mostly server-action + UI work, not a schema change.

### Build this
- `deleteTaskAction(taskId)` in `tasks/actions.ts` — admin/staff-only (reuse the same `isStaff`
  check used elsewhere), confirm dialog in the UI, then hard delete (task_logs cascade
  automatically).
- `deleteProjectAction(projectId)` in `tasks/actions.ts` — admin/staff-only, and **make the confirm
  dialog explicit that this deletes every task inside it too** since the FK cascade means deleting
  a `task_project` deletes all its tasks. Consider requiring the project to be empty, or typing
  the project name to confirm, given how destructive it is.
- `deleteEventAction(eventId)` in `events/actions.ts` — admin/staff-only, confirm dialog (existing
  volunteer signups for that event will cascade-delete too — mention that in the confirm copy).
- Wire small "delete" affordances (trash icon + confirm, matching the existing archive-task
  pattern in `ArchiveTaskButton.tsx`) into the project detail page, the task detail view, and the
  events list/detail page — restricted to Team Lead/Owner, same as the other admin-only actions.

---

## Phase 3 — Team login page: bugs + redesign

### Why
The current flow (`login/page.tsx` + `logInAction` in `auth/actions.ts`) looks structurally sound
— username → look up email via the admin client → `signInWithPassword` → clock in → redirect. No
obviously broken logic jumped out in review, which means the actual bug you're hitting is
something Claude Code will need you to describe precisely (a specific error message, which
account/device it happens on, whether it's every login or intermittent) — this section is a
placeholder until you have that detail. It's also very possible some of what looks like a login
bug is actually a symptom of the Phase 0 middleware slowness (e.g. a login that appears to "hang"
or "fail" under load) — worth re-testing after Phase 0 ships before chasing anything further here.

### Build this
- **Before starting:** get the exact repro from Krish — what happens, for whom, how often — so
  this doesn't turn into speculative rewriting.
- Redesign pass: apply the brand system from `CLAUDE.md` (navy `#0E173F` / crimson `#981C21`
  gradient, the logo lockup, condensed bold headline style) to the `/team/login`,
  `/team/signup`, `/team/forgot-password`, and `/team/reset-password` pages — right now they're
  plain white-card forms with no branding treatment, inconsistent with the marketing site.

---

## Phase 4 — Build/Parts page fixes

### Why
Three separate, independently-fixable issues in `src/lib/parts/actions.ts`:

- **Product image not showing:** `parts.image_url` already exists as a column, and the UI
  presumably tries to render it — but `fetchLinkMetadataAction()` only ever extracts `og:title`
  and a best-effort part number from the linked page. It never reads `og:image`, so `image_url`
  never gets populated by anything. This is a small, contained fix.
- **No bulk label printing:** `PrintLabelButton.tsx` opens one popup window and prints one label
  at a time — there's no "select several parts → print all their labels" flow.
- **Location isn't a dropdown:** `createPartAction`/`updatePartAction` take `location` as a free
  text field with no suggestions, so typos and inconsistent naming pile up over time.

### Build this
- In `fetchLinkMetadataAction`, also match `<meta property="og:image" content="...">` (and fall
  back to `<link rel="image_src">` if absent) and return it alongside `name`/`partNumber`. Save it
  into `parts.image_url` in both `createPartAction` and `updatePartAction`. Render it as a
  thumbnail in the parts table/list and in the scan flow.
- Add a "Print all labels" action: either a checkbox-select-multiple on the parts table with a
  bulk print button, or a "select all" toggle — generate all barcodes onto one print window laid
  out as a grid of 2×1 labels (reuse the existing `JsBarcode` + `@page{size:2in 1in}` approach from
  `PrintLabelButton.tsx`, just repeated per part) so it's one print job instead of N.
- Turn `location` into a combo-box: query `select distinct location from parts where location is
  not null order by location` and populate a `<datalist>` (simplest, keeps free text as an escape
  hatch for a genuinely new location) or a proper searchable dropdown component if you want to
  disallow free text entirely — recommend `<datalist>` first since it's a small change with no new
  component needed.

---

## Phase 5 — Projects timeline feature

### Why
Right now `task_projects` only support a single deadline with a change-log
(`task_project_deadline_log`), and individual tasks have their own `deadline` — but there's no
timeline visualization anywhere, per-project or across all projects.

### Build this
- **Per-project view** (`projects/[projectId]/page.tsx`): add a timeline/overview panel showing
  every task in that project plotted against its deadline (a simple horizontal timeline or a
  sorted deadline list grouped by week/month is a reasonable v1 — a full drag-and-drop Gantt chart
  is not necessary here). Surface the project's own deadline as a marker on the same timeline.
- **Main Projects dashboard** (`projects/page.tsx`): add a combined view that layers every active
  project's deadline (and optionally each project's tasks) onto one shared timeline, with each
  project rendered in a distinct, consistent color. Add a `color` column to `task_projects`
  (assign a default palette value on creation, editable by staff) so the color is stable across
  views instead of being re-derived every render.
- Keep the existing list view as the default and add this as a second view/tab (similar to how
  Events already has a calendar-view toggle) rather than replacing the current layout outright.

---

## Phase 6 — Owner: delete a member's clock log entries

### Why
`admin/reports/page.tsx` and `admin/actions.ts` already have hour-tracking views and per-member
tooling (`updateMemberFieldAction`, `updateMemberRoleAction`, `setMemberPasswordAction`,
`deleteMemberAction`), but nothing lets the Owner remove an individual bad `clock_sessions` row
(e.g. someone forgot to clock out and it inflated their hours).

### Build this
- `deleteClockSessionAction(sessionId)` in `admin/actions.ts`, gated to `role === "owner"` only
  (not Team Lead/Admin — this directly affects hour-tracking integrity, so keep it Owner-only per
  how you described it).
- Add a delete affordance next to each session row in the admin member detail view
  (`admin/members/[id]/page.tsx`) with a confirm dialog showing the date/duration being removed.
- Consider a soft-delete (a `deleted_at` column) instead of a hard delete, so there's an audit
  trail of what got removed and by whom — cheap insurance given this edits official hour records.

---

## Phase 7 — Custom roles & granular permissions

### Why — this is the big one
Roles are currently a fixed Postgres enum (`user_role`: `owner` / `team_lead` / `member` /
`parent`) baked into `src/lib/supabase/types.ts`, checked with hardcoded logic in dozens of
places (`isStaff()` in `auth/session.ts`, the parent-path allowlist in `middleware.ts`,
`EVENT_VISIBILITY_ROLES` in `roles.ts`, every `deleteXAction`'s staff check, etc). What you're
asking for — the Owner being able to create a new named role and choose exactly which
permissions it has — is a real architecture change, not a UI tweak. Flagging that up front so
it's scoped and scheduled properly rather than squeezed in alongside everything else.

### Build this
- New tables: `roles` (`id`, `name`, `is_system boolean` — seed the four existing roles as
  system roles so nothing else breaks), `permissions` (a fixed catalog: e.g.
  `approve_tasks`, `delete_tasks`, `delete_projects`, `delete_events`, `manage_members`,
  `manage_roles`, `view_all_hours`, `delete_clock_sessions`, `manage_parts`, …), and
  `role_permissions` (`role_id`, `permission_key`) as the join table.
- Migrate `users.role` (enum) → `users.role_id` (FK to `roles`), backfilling existing users into
  their matching system role. Keep `owner` special-cased and non-deletable/non-editable in the UI
  — there should always be exactly one, per the original spec.
- Replace hardcoded role checks (`isStaff`, the parent allowlist, per-action `role === "..."`
  checks) with a single `hasPermission(profile, "permission_key")` helper backed by the new
  tables, and audit every existing check site to convert it — this is the part that takes the
  real time, budget for it.
- Admin Dashboard: new "Roles" panel — list roles, create a new one, and a checkbox grid of every
  permission in the catalog. Assigning members to a role becomes a dropdown of all roles instead
  of the current fixed four.
- **Scope-down option if this is too big for one pass:** ship it as "create custom-named roles
  that map to one of the existing four permission tiers" first (no granular per-permission
  toggles yet), then layer true per-permission control on top in a follow-up. Worth deciding
  before starting, not partway through.

---

## Phase 8 — Onshape BOM import: full order → collect → build → reconcile pipeline

### Why
This is new functionality on top of the Build tab's existing `projects` / `parts` /
`part_allocations` / `scan_events` model (see the naming note at the top — this is the Build
tab's "projects", e.g. Prototyping/V1, not the Projects-tab timeline from Phase 5). This isn't a
single feature so much as a full lifecycle for one robot version's parts: bring in the BOM, figure
out what's missing, physically gather/build everything, track it as it arrives and gets installed,
and eventually get it all back into general stock when that version gets torn down. Laid out below
as six steps, each buildable and testable on its own, in order.

**No Onshape API.** Krish has already used up the Onshape API token/credit allowance, so this
does not call Onshape's official API at all, live or otherwise — drop that idea from the original
Phase 8 draft entirely. Instead there are two fully web-based ways a BOM gets in, both handled
inside the deployed app itself (no local terminal step required for either):
- **CSV upload** — Onshape can export any assembly's BOM to CSV from its own UI (no API
  involved, just a manual export Krish or a teammate does in Onshape and downloads, then uploads
  here). Always available, works for any document regardless of sharing settings, and is the
  fallback if the link-based path below ever misreads something.
- **Paste an Onshape document link** — the server fetches that page directly (a plain HTTP fetch,
  the same way `fetchLinkMetadataAction` already fetches vendor links in Phase 4/`parts/actions.ts`
  — no Onshape API call, no OAuth) and hands the fetched content to Claude (via the shared
  `ANTHROPIC_API_KEY`, same setup as Phase 9) with a structured-extraction prompt to pull out BOM
  rows — same technique as the vendor-order-PDF extraction in Step 5, just against fetched HTML
  instead of PDF text. **This only works for a document Onshape is showing to an unauthenticated
  visitor** — the server has no logged-in Onshape session, so the document has to be set to
  "Public" or "Anyone with the link can view" in Onshape's own share settings first. That's a
  one-time setting on Krish's end, not something Claude Code can code around — worth surfacing as
  an inline error ("couldn't read that document — check it's shared publicly in Onshape") if the
  fetch comes back looking like a login page instead of document content.

### Step 0 — Remove what this replaces
Since the first version of this plan, the live-Onshape-API BOM import (and the two generic
"scan anything into/out of a project" entry points from the original spec) actually got built —
so this phase now starts by removing three things that are being superseded, not just adding new
ones. Do this removal *as part of* building the steps below, not as a separate cleanup pass, so
there's never a moment with two competing ways to do the same thing.

- **The live Onshape API integration is what's being replaced — remove it entirely, it's the
  thing burning API tokens Krish no longer has:**
  - Delete `src/lib/onshape/client.ts` (the Onshape REST client/auth) and
    `src/lib/onshape/bom.ts` (parses Onshape's proprietary BOM JSON response shape — not reusable
    for CSV/text parsing, that's new code in Step 1).
  - Delete `src/app/api/onshape/bom-stl/route.ts` (STL zip download) — it depends entirely on live
    API access to pull part geometry, so it can't survive this change. This is a real feature
    loss worth flagging to Krish explicitly, not silently dropping: auto-downloading STLs for the
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

### Step 1 — Bring in the BOM
- New page/section on the Build tab: "Import BOM" → pick which (Build-tab) `project` this is for
  (e.g. "V1") → either upload a CSV **or** paste an Onshape document link — one form, two input
  modes, same result either way (a set of parsed `bom_lines`).
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
- New table `bom_imports` (`id`, `project_id` → Build-tab `projects`, `source` — `csv` or
  `onshape_link`, `source_ref` — filename or the pasted URL, `imported_by`, `imported_at`,
  `status` — `draft` while being reviewed, `confirmed` once Step 2's categorization is approved)
  and `bom_lines` (`id`, `bom_import_id`, `name`, `part_number`, `material`, `vendor_link`,
  `qty_needed`, `category`, `matched_part_id` nullable FK to `parts`). Keep the raw parsed rows in
  `bom_lines` even before categorization is confirmed, so a bad import can be reviewed/discarded
  without re-uploading or re-fetching.

### Step 2 — Classify every line
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
    when materials change" mechanism the original plan asked for — no new admin UI/table needed
    for this unless Krish specifically wants it moved into a settings screen later.
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

### Step 3 — Compare purchased parts against inventory
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

### Step 4 — Physical collection + the scan-in checklist
- This is where it becomes a checklist instead of just a report. Every confirmed `bom_line` — not
  just the "Collect" ones — ends up needing to physically land in this project's allocation
  eventually: *Collect* lines get pulled from the shelf, *3D Print*/*Custom Cut* lines get
  fabricated, *Order* lines arrive later (Step 5). In every case, the actual moment a part joins
  the robot is a **scan**, using the barcode flow that already exists (`scanAction`, mode
  `"remove"`, tied to this project) — reuse it exactly as-is rather than building a second write
  path.
- For **Collect** lines: the existing barcode is already on the part in inventory (or gets printed
  now via Phase 4's bulk-print) — staff pulls it and scans it in like any other part-to-project
  removal.
- For **3D Print** / **Custom Cut** lines: these usually won't exist as `parts` rows yet
  (they're new geometry, not a catalog item). On import confirm, auto-create a `parts` row for
  each one (name + material from the BOM line, `qty_in_stock: 0`, a fresh generated barcode) so
  there's something to print a label for and scan once it comes off the printer/laser — matching
  by name+material against prior imports first so re-importing an updated BOM doesn't create
  duplicate catalog entries for the same part. **Only auto-merge this way when the line has no
  `part_number`.** The real sample BOM is full of unrenamed default Onshape names — `Part 1`,
  `Part 2`, `part1`, repeated dozens of times across completely unrelated parts — so a
  name+material match on these would silently merge unrelated geometry into one catalog entry.
  Safer default: treat every no-part-number line as its own new `parts` row (no auto-merge at
  all) and let staff manually merge duplicates from the review screen if they spot real ones,
  rather than risk silently conflating different parts that happen to share Onshape's placeholder
  name.
- Build a single "Scan checklist" view per `bom_import`: every line, its category, its status
  (not started / collected / ordered / fabricated / scanned in), so at a glance staff can see
  what's still outstanding for this version — this is the answer to "there should be a list of all
  the parts that need to be scanned into that specific project."

### Step 5 — Vendor order receiving (PDF or CSV) — auto-allocates straight to the project
Decided: unlike Step 4's "everything gets scanned" rule, a received order skips the scan step —
receiving the order **is** the confirmation. Parts that were ordered *for* this BOM/project
allocate straight to it; anything extra in the same order lands in general inventory instead.

- **Input:** upload either a CSV, or a PDF of the order/invoice (a GoBilda order confirmation,
  etc.) — self-populating the line items from the PDF rather than requiring Krish to hand-type
  them. PDF text layout varies a lot vendor to vendor, so don't hand-write a regex parser per
  vendor: extract the PDF's text (`pdf-parse` or similar) and send it to Claude with a structured
  extraction prompt — "here's the raw text of a vendor order, return the line items as
  {part_name, part_number, qty_ordered, unit_price}" — using the same `ANTHROPIC_API_KEY` setup as
  Phase 9 (see the note at the end of Phase 9 about what this does and doesn't cost). Always show
  the extracted lines on an editable review screen before anything gets written — a misread line
  item is a real risk with any PDF extraction, structured or not, so nothing auto-commits.
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
- If a line doesn't match any existing part, create a new `parts` row for it first (same as Step
  4 does for fabricated parts) before applying the allocation logic above.

### Step 6 — V1 teardown: return parts to inventory with reconciliation
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

## Testing Phase 8

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

## Phase 9 — AI chat assistant

### Why
`@anthropic-ai/sdk` is already a dependency in `package.json` — this was clearly planned for
already, just not built yet.

**On "each user connects their own Claude account" — not possible, and here's the actual
tradeoff.** There's no public mechanism for a custom app like this one to let a team member sign
in with their personal claude.ai/Claude Pro account and have API calls billed against *their*
subscription. Claude Code's own "log in with claude.ai" is a special integration scoped to Claude
Code itself, not something third-party apps can plug into — the Messages API this app would call
(`@anthropic-ai/sdk`) is a separate product from claude.ai, with its own API key and its own
pay-per-token billing through console.anthropic.com. In practice this means one shared
`ANTHROPIC_API_KEY`, most naturally billed to Krish (same as the Supabase/Vercel free-tier
accounts already are), used by every member's requests. Worth sizing the actual cost concern: a
chat message that creates a task, or a PDF extraction call, is a small amount of text in and out —
call it a fraction of a cent to a few cents per use on Claude's smaller/cheaper models, nothing
like Onshape's API allowance. If minimizing spend still matters, cap it at a cheap model
(Haiku-tier) for these structured extraction/tool-use tasks rather than a larger one — accuracy
needs for "pull line items off an invoice" or "parse one sentence into a task" don't call for the
most expensive tier. Note that Phase 8's BOM link-import and vendor-order PDF extraction both lean
on this same shared key — build whichever of Phase 8/9 comes first with that env var setup in
mind so the second doesn't duplicate it.

### Build this
- Add an `ANTHROPIC_API_KEY` to `.env.local` / Vercel env vars (same pattern as the Supabase keys
  in `TEAM-APP-SETUP.md`).
- Build a chat UI (a small panel, likely reachable from the header) that sends free text to a new
  server action/route.
- On the server, call Claude with **tool use** defined against the app's existing server actions
  — `createTaskAction`, `createEventAction`, `createPartAction`, etc. — rather than having the
  model write to Supabase directly. Reusing the real actions means every existing validation and
  permission check (staff-only, required fields) still applies automatically, and it saves you
  from building/maintaining a second write path.
- **Don't auto-commit on the model's first response.** Have it return a proposed action (e.g.
  "Create task 'Order PETG spools' in Software, due Friday — confirm?"), show that as a preview
  card, and only call the underlying server action once the person clicks confirm. This matters
  more now that delete actions exist too (Phase 2/6) — you don't want a misread instruction
  silently deleting something.
- Scope v1 to a handful of clearly-defined intents (create task, create event, add part, log a
  task update) rather than open-ended "do anything" — expand the tool list over time once the
  pattern is proven out.

---

## Open items before/while Claude Code works through this

- **Phase 3:** need the actual login bug repro from Krish (what happens, how often, for whom)
  before that part of the phase can be built — the redesign half can proceed independently.
- **Phase 7:** decide up front whether to build full granular permissions or the scoped-down
  "custom roles mapped to existing tiers" version first.
- **Phase 8:** the BOM CSV column names are now confirmed against a real export (see Step 1 and
  the Testing section) — no longer open. Vendor order PDFs will still vary layout-to-layout across
  different vendors — the sample tested is one real goBILDA page, useful as a first regression
  check, but don't assume every future vendor's PDF will extract as cleanly; keep the
  review-before-write screen non-negotiable for exactly this reason.

## How to run this with Claude Code
Same rhythm as the original build (see `GETTING-STARTED.md`): one phase at a time, run `npm run
dev` and actually click through each phase before moving on, commit after each working phase, and
start a fresh Claude Code session per phase if things get long. Point Claude Code at this file the
same way it already reads `CLAUDE.md` — e.g. "Read TEAM-APP-UPDATES.md, let's start with Phase 0."
