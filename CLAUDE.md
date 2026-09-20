# Tech Titans 25783 — Project Brief

Read this file in full before writing any code. This is the complete spec for the project, distilled from planning done in Claude.ai. Reference images and PDFs for this spec live in `/assets`.

## Who this is for
FTC Team Tech Titans 25783, Centennial High School, Frisco ISD, TX. A 100% student-led nonprofit robotics organization. Owner/founder: Krish Vadivel.

## What we're building
**One single Next.js project** containing two things:
1. A public marketing website (rebuilding `friscochsrobotics.org`, currently built on Lovable, from scratch)
2. A private team management app for members, reachable at the `/team` route inside the same project (no subdomain, no separate deployment — just another route)

Domain `friscochsrobotics.org` is owned by Krish and managed through GoDaddy DNS. Once this project is deployed to Vercel, GoDaddy's DNS will be repointed at Vercel (Vercel will show the exact A/CNAME records once the project exists there).

## Tech stack
- **Framework:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend/DB/Auth/Storage:** Supabase (Postgres + Auth + Storage) — free tier
- **Hosting:** Vercel — free tier
- **Speech-to-text:** browser Speech Recognition API (or a transcription API call) for audio task-log notes

## Brand system
Logo: `/assets/logo/tech-titans-logo.png`

| Swatch | Hex | Use |
|---|---|---|
| Navy | `#0E173F` | Primary background / header / footer |
| Crimson | `#981C21` | Accent — buttons, highlights, active states |
| Near-black | `#09060E` | Outlines, borders, deep surfaces |
| White | `#FFFFFF` | Text on dark backgrounds, card surfaces |

Style notes pulled from the current site (see `/assets/site-screenshots/`, 14 images):
- Navy → crimson diagonal gradient hero sections, dark navy footer
- Bold condensed white headlines on dark sections, crimson highlight words
- Card grid pattern on light-blue-tinted backgrounds for teams/awards/events
- Red accent buttons with arrow icons; navy outline secondary buttons
- Small-caps red "eyebrow" labels above section headlines (e.g. "OUR MISSION IN ACTION")
- Big-crimson-number stat blocks used throughout
- TT logo badge + "TECH TITANS / 25783 · FRISCO ISD" lockup in nav and footer

Layout/tone inspiration (for structure and community feel, not to copy content): mckinneysteamacademy.org, thecluelessftc.org. Copy should read as a student-led community nonprofit, not a company — avoid corporate/product language.

---

## Part 1 — Marketing site pages

Reference the 14 screenshots in `/assets/site-screenshots/` for the current site's exact layout per page, and `/assets/docs/area-documentation.pdf` + the sponsorship packet content below for source copy.

1. **Home** — hero ("Centennial Youth Robotics Organization"), stat band (students reached / outreach hours / teams launched / countries), mission cards (Engineer / Empower / Expand), founder spotlight (Krish Vadivel — his story is in the screenshots), recent honors preview, "Apply" + "Sponsor" split CTA cards
2. **Teams** — flagship Tech Titans 25783 + partner/sister teams (Titanium Robotics 31166, Titan Bots 33400, Flappy Bots 31450, Tech Energy, STEAM Robotics, Cyber Sisters, plus Wakeland HS and Heritage HS teams), international partner country list (Italy, Indonesia, Nigeria, Saudi Arabia, Argentina, Iceland, Canada, Morocco)
3. **Outreach** — "Frisco, TX → The World" hero, featured Italy FTC Championship story with stats, local impact section, full past/upcoming events list, downloadable PDF (`/assets/docs/area-documentation.pdf` — this combined PDF includes the mission/structure/engineering docs AND the sponsorship packet)
4. **Awards** — milestone stat grid, season-by-season award cards (2025–26 Decode season, 2024–25 Into the Deep season — exact awards are in the screenshots)
5. **Camps** — Summer Robotics Camp details/dates/curriculum, registration CTA
6. **Sponsor** — transparent budget breakdown, sponsorship tier cards (Family & Friends → Bronze → Silver → Gold → Platinum → Diamond/Title Sponsor — exact tiers and pricing are in the screenshots), Donate button + QR code
7. **Apply** — eligibility stages (home team vs. partner community team), application timeline, "Start your application" CTA
8. **Team member bios** — one page per member: photo, role, achievements (ask Krish for the roster + bios when you get here)
9. **Reviews/testimonials** — quotes from mentors, sponsors, parents (one example quote from "East Loop Components" is in the screenshots — ask Krish for more)
10. **Team tab** — nav link to `/team` (the app below)

---

## Part 2 — Team management app (`/team` route)

### Sign In / Sign Up
- Header: team logo + "Tech Titans 25783"
- Sign in: username + password, eye icon to reveal password
- New members sign in with a starter password from their captain/coach, forced to set their own password on first login
- Sign up: name, username, email, password → account auto-created on submit
- Logging in **automatically clocks the member in** and logs the timestamp

### Roles
Two roles: **Owner** (Krish — hardcode or seed as the first account) and **Admin**. Only the Owner can promote a member to Admin.

### Tab 1 — Task Manager
- Task list; anyone can submit a task, but it's **hidden until an Admin approves it**
- Each task: name, subteam (mechanical / electrical / cad / software / outreach / marketing), deadline, small "created by · on [date]" caption
- **Add Task** (top right) → popup form
- **Archive Task** — Admin-only. Small minus icon → confirm dialog → task moves to bottom, greyed out, labeled "Archived"
- Filter by subteam, sort by date/name, toggle to calendar view
- Click a task → detail/log view:
  - Full history of everything logged against that task
  - Add a log entry: photo, text description, or audio note (auto-transcribed to text)
  - Each log shows timestamp (time since clock-in) and who posted it
  - Submit options: "Submit & continue" (starts a new timer for the next task) or "Submit & exit" (auto clocks the member out)
- **Clock Out** button top-right of the page

### Tab 2 — Important Dates
- Add event: name, date, time, info, # parent volunteers needed, # student volunteers needed
- Click event → volunteer counts + "Volunteer" button (asks name, email, notes)
- "Remove my registration" → popup: contact info to have it removed manually
- Calendar-style view of all events

### Tab 3 — Build (Parts Manager)
- Inventory table: name, qty in stock, link (auto-pull part number + name from the link), location, print a plain text label (name + part number)
- Supports multiple variations of the same part
- **Collect flow:** on a project's BOM checklist, pick a quantity (defaults to what's needed, adjustable) to mark brought from stock into that project — decrements stock, credits the project's allocation
- **Put back flow:** same checklist line, pick a quantity (defaults to what's currently allocated, adjustable) to mark returned to general stock — credits stock, debits the project's allocation. Available both on the project's main page and during a project's disassembly
- Manual reallocation between projects as a fallback

### Tab 4 — Clock Log
- Personal log: every clock-in/out with tasks worked + logs submitted that session
- Team-wide combined log: everything worked on, by everyone, for the season/year

### Admin Dashboard
- View clock-in/hour logs and volunteer-hour logs for every member, filterable by person
- Flag anyone under the **6 hours/week** minimum commitment
- Send a nudge email to flagged members
- Approve/reject pending tasks
- Archive tasks

---

## Data model (starting point — adjust as needed)

```
users            id, name, username, password_hash, role(member/admin/owner), subteam, must_reset_password
clock_sessions   id, user_id, clock_in, clock_out
tasks            id, title, subteam, deadline, created_by, created_at, status(pending/active/archived), approved_by
task_logs        id, task_id, user_id, timestamp, description, photo_url, audio_transcript
events           id, name, date, time, info, parent_slots_needed, student_slots_needed
event_volunteers id, event_id, name, email, notes, type(parent/student)
parts            id, name, part_number, link, location, qty_in_stock
projects         id, name              -- e.g. Prototyping, V1, V2
part_allocations id, part_id, project_id, qty
scan_events      id, part_id, project_id, user_id, action(remove/add), qty, timestamp
```

---

## Suggested build order
1. Marketing site: 9 public pages, matching the current design system
2. Supabase project: schema + auth + roles
3. Sign in / sign up, branding, auto clock-in
4. Task Manager tab (board, filters, calendar view, log detail view, clock logic, admin approval)
5. Important Dates tab
6. Build/Parts Manager tab (inventory, collect/put-back flows, label printing)
7. Clock Log tab + Admin Dashboard (hour tracking, 6 hrs/week flagging, email nudges)
8. Polish pass — mobile layout, PWA install prompts
9. Deploy to Vercel, repoint GoDaddy DNS, test with the team

## Still needs Krish's input when you get there
- Team roster + member bios/photos for the bio pages
- Where the "Apply" form should submit to (Google Form? native form + email?)
- More testimonial quotes beyond the one in the screenshots
