# Team app setup (Supabase)

The `/team` app (sign in, task manager, events, parts, clock log, admin
dashboard) needs a Supabase project to store data and handle auth. Free tier
is plenty for a team this size.

## 1. Create the project
1. Go to [supabase.com](https://supabase.com) and sign up / log in (GitHub
   login is fastest).
2. Click **New project**. Pick any name (e.g. `tech-titans-25783`), a
   password (you won't need it directly), and the region closest to Frisco,
   TX (e.g. `us-east-1`).
3. Wait ~2 minutes for it to provision.

## 2. Get your API keys
In the new project, go to **Project Settings → API**. You need three values:
- **Project URL**
- **anon / public key**
- **service_role key** (click "Reveal" — keep this one secret, never commit it)

Copy `.env.local.example` to `.env.local` in this folder and paste them in:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

`.env.local` is already git-ignored, so these never get committed.

## 3. Run the database schema
1. In Supabase, open **SQL Editor**.
2. Open `supabase/schema.sql` from this project, copy the whole file, paste
   it into the SQL Editor, and click **Run**.
3. This creates every table (users, tasks, events, parts, etc.), enables
   row-level security, and sets up the `task-photos` storage bucket.

It's safe to re-run this file any time — every statement is idempotent.

## 4. Create your Owner account
1. Run the app locally (`npm run dev`) and go to `http://localhost:3000/team/signup`.
2. Sign up with your own name/username/email/password — this creates a
   normal `member` account.
3. Back in Supabase's SQL Editor, run (swap in your actual username):

   ```sql
   update public.users set role = 'owner', must_reset_password = false
   where lower(username) = 'krish';
   ```

4. Log out and back in — you'll now see the **Admin** tab, and only this
   account can promote others to Admin.

From here, use the **Add member** button on the Admin Dashboard to create
starter accounts for the rest of the team (they'll be forced to set their
own password on first login).

## What's already wired up
- Username + password sign in (auto clocks you in)
- Self-serve sign up
- Forced password reset for admin-provisioned accounts
- Task Manager, Important Dates, Build/Parts Manager (camera barcode
  scanning + label printing), Clock Log, Admin Dashboard
- Installable PWA at `/team` for camera scanning on phones

## Notes / things to revisit later
- **Email nudges** currently open a pre-filled `mailto:` link rather than
  sending automatically — wiring up a transactional email provider (e.g.
  Resend) is a natural next step if you want it fully automated.
- **"Auto-pull part number + name from a link"** fetches the linked page's
  `<title>` as a best-effort name suggestion (editable before saving) —
  vendor sites vary too much to reliably parse a part number automatically.
