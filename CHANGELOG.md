# Changelog

## 2026-11-11 — Team Members can add work logs

- New **"Add work logs"** permission (`add_logs`), granted to every role. It's the **only** permission the Team Member role has.
- It covers all three ways to log: the task "Add a log" button, the AI chat assistant's log action, and Google Chat `/debrief`.
- **"Contribute"** no longer includes logging. It now covers volunteering, adding/editing parts, creating Build projects, and moving stock.
- The chat assistant no longer has a blanket "contribute" check. Each proposed change is checked by the action that carries it out (tasks need `create_tasks`, events `manage_events`, parts `contribute`, logs `add_logs`).
- Wording: "view-only" messages now say "Your role can't make this change". The Add Member option reads "Team Member — can only add work logs".
- The live database already has the permission granted. `supabase/schema.sql` matches.

## 2026-11-11 — Google Chat `/debrief` app

- New Google Chat app: typing **`/debrief`** in a space opens a form (Project → Task → "What did you work on?"). **Post** saves the update as a work log on that task and posts it to the space.
- Endpoint: `POST /api/google-chat`. Every request must carry a Google-signed token whose audience matches `GOOGLE_CHAT_AUDIENCE`. Anything else gets a 401.
- The poster is identified only by Google's verified email, matched to the dashboard account with that email.
- View-only Team Members get a private "your role is view-only" reply. Emails with no account get "Ask a Senior Team Lead to add you".
- New env vars: `GOOGLE_CHAT_AUDIENCE` (required, the exact endpoint URL) and `GOOGLE_CHAT_ALLOWED_EMAILS` (optional comma-separated allowlist).
- New dependency: `jose`, for verifying Google's token.

## 2026-11-10 — Task stages, calendar view, role restructure, darker dark mode

### Task stages
- Tasks can now move through multiple **stages** (Mechanical, Electrical, CAD, Software, Outreach, Marketing, or Testing), each with its own deadline and done checkbox.
- A task's own subteam is always its first stage, labeled **Main**. It can't be removed, and it follows the task if the subteam changes.
- Open a task's **Details** on the Projects board to start new stages (`＋ Mechanical`, `＋ Testing`, …), edit stage deadlines, mark stages done, or remove one started by mistake.
- Starting, finishing, reopening, or removing a stage, and changing its deadline, are all recorded in the task's activity log. A stage deadline past the project's deadline pushes the project deadline out.
- The **Add Task** form now asks only for stages: pick them in order with a deadline for each. The first subteam picked is the main one, and the task is due when its last stage is due.
- The task checkbox fills from the bottom as stages are completed (e.g. 1 of 3 done → a third filled). A `done/total` badge shows next to the subteam.
- Database: new `task_stages` table, and a trigger that gives every task (however it's created) its main stage. Existing tasks were backfilled.

### Calendar view
- A calendar icon on the Projects page switches to a calendar of every stage deadline (color-coded by project) plus 🏁 project deadlines.
- **Week** and **Month** views. Month view lists every item in full instead of "+N more". The view choice stays in the URL (`?view=calendar&cal=week`).
- Clicking an item opens that task in the list view. The **By priority / By timeline** toggle stays visible and switches back to the list.
- Entering the app always lands on the **By priority** list.

### Roles and permissions
- **Renamed:** Team Lead → **Senior Team Lead**, and Team Member → **Team Lead**. Their permissions are unchanged.
- **New Team Member role** that is **view-only**. It can see everything but can't submit tasks or logs, volunteer, edit parts, or move stock.
- **Parent role removed**, along with the Events-only navigation for parents.
- **New permission "Contribute":** required for submitting logs, volunteering, adding/editing parts, and moving stock. Every role has it except Team Member.
- **New permission "Add tasks & projects":** only Senior Team Lead and Owner have it by default.
- **Task approval removed.** New tasks go live immediately, and the Admin "Pending task approvals" section and the `approve_tasks` permission are gone.
- Add Member now offers Team Member (view only, the default), Team Lead, or Senior Team Lead (Owner-only).
- Server actions that used to only check "signed in" now check the right permission (task/project creation, logs, parts, Build projects, stock moves, volunteering, confirming AI chat proposals).

### Dark mode
- True black page background (`#000000`), near-black cards (`#121212`), and slightly stronger borders. The green/gold accents are unchanged.

### Data changes applied directly to Supabase (not part of the code)
- Mechanical (due 11/15) and Testing (due 11/18) stages added to the Mock Kickoff CAD tasks and the Trisha End Effector task, and "CAD" removed from those task titles.
- Roles reassigned: 1 Owner, 9 Senior Team Leads, 17 Team Leads, 33 Team Members. Armaan (`armaan.k`) was added as a Senior Team Lead.

### Deploy notes
- `supabase/schema.sql` already matches the live database. No re-run is needed.
- The Google Chat `/debrief` work in progress (`src/app/api/`, `src/lib/googleChat/`, the `jose` dependency, and the env example) is **not** in this commit.
