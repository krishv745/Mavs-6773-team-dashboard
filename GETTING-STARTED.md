# Getting Started — Building the Tech Titans Site + App in Claude Code

Claude Code doesn't import a claude.ai chat directly — instead, everything we decided in this
chat has been distilled into `CLAUDE.md` in this folder. Claude Code automatically reads that
file at the start of every session, so it has the full spec without you re-explaining anything.

## 0. What's in this folder
```
starter-kit/
  CLAUDE.md                  <- the full project spec, auto-read by Claude Code
  GETTING-STARTED.md         <- this file
  assets/
    logo/tech-titans-logo.png
    app-reference/           <- the 3 dashboard/sign-in reference screenshots
    site-screenshots/        <- 14 screenshots of the current friscochsrobotics.org
    docs/
      area-documentation.pdf <- mission/structure/engineering doc + sponsorship packet
      app-spec-notes.pdf     <- your original handwritten app notes
```

Download this whole folder and put it wherever you keep code projects on your computer,
e.g. `~/projects/tech-titans/` on Mac/Linux or `C:\Users\you\projects\tech-titans\` on Windows.

## 1. Accounts you'll need (all free tiers)
- **Claude Pro** — you're getting this tonight, unlocks Claude Code
- **GitHub** — github.com — where the code lives; sign up if you don't have one
- **Vercel** — vercel.com — hosting; sign up with your GitHub account (one click)
- **Supabase** — supabase.com — database/auth/storage; sign up with GitHub too

You don't need to set these up right now — Claude Code will tell you exactly when it needs
each one and walk you through it.

## 2. Install Claude Code

**Mac / Linux:**
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://claude.ai/install.ps1 | iex
```

Confirm it worked:
```bash
claude --version
```

## 3. Log in
```bash
claude
```
This opens a browser window — log in with the Claude account you're upgrading to Pro tonight.
You only need to do this once; your login is saved.

## 4. Start your first session
```bash
cd path/to/tech-titans          # the starter-kit folder you downloaded
claude
```

Claude Code will notice `CLAUDE.md` and load it automatically. Your first message can be as
simple as:

> Read CLAUDE.md and the assets. Let's start with step 1 of the build order — scaffold the
> Next.js project and build the marketing site pages, starting with Home.

## 5. How the build actually goes from here
This is a big project, so don't try to do it in one giant session. The natural rhythm:

1. **One phase at a time** — follow the "Suggested build order" in `CLAUDE.md`. Tell Claude
   Code which step you're on; let it finish and test that step before moving to the next.
2. **Review as you go** — Claude Code will ask before making changes (unless you switch
   permission modes with `Shift+Tab`). Actually look at what it built — run the dev server
   (`npm run dev`) and click around before saying "looks good, next step."
3. **Commit often** — after each working chunk, just say "commit these changes" — Claude Code
   handles git for you.
4. **Accounts come up naturally** — when you hit step 2 (Supabase) or step 9 (deploy to
   Vercel), Claude Code will tell you exactly what to click/create and walk you through
   connecting it.
5. **Start a fresh session per work block** — if a session gets long or Claude seems to be
   losing track, run `/clear` or just start a new `claude` session. `CLAUDE.md` gets reloaded
   every time, so context isn't lost.
6. **Give it your missing inputs when it asks** — team roster/bios, where the Apply form
   should go, more testimonials — these are flagged at the bottom of `CLAUDE.md`.

## 6. Domain cutover (near the end)
Once the app is deployed to Vercel and you're happy with it, Vercel will give you exact DNS
records to add. Log into GoDaddy → DNS management for friscochsrobotics.org → add those
records. Claude Code can walk you through this step-by-step when you get there — just ask.

## Quick reference
| Command | What it does |
|---|---|
| `claude` | start a session in the current folder |
| `claude -c` | continue your most recent session here |
| `/clear` | reset context mid-session |
| `Shift+Tab` | cycle permission modes (ask-every-time / auto-accept edits / plan-only) |
| `/help` | see all commands |
