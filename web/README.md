# McGill Seat Alert — web app

A hosted version of the seat alert: people sign in with an email link, pick courses and sections, and get an email or push notification (ntfy) when a full section opens up. Nobody has to fork the repo.

Stack: Next.js on Vercel, Supabase (auth + Postgres), Resend (email), ntfy (push), GitHub Actions (hourly schedule).

## Local development

```bash
cp .env.example .env.local   # fill in the values below
npm install
npm run dev
```

## Deploying

### 1. Supabase
1. Create a project at supabase.com.
2. In **SQL Editor**, run `supabase/migrations/0001_init.sql`.
3. **Authentication → URL Configuration**: set Site URL to your deployed URL and add `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback` for dev) to Redirect URLs.
4. Copy the project URL, anon key and service role key from **Project Settings → API**.
5. Optional: under **Authentication → SMTP**, point Supabase at Resend so sign-in emails aren't rate-limited by the built-in sender.

### 2. Resend
Verify a sending domain and create an API key. `RESEND_FROM` looks like `Seat Alert <alerts@yourdomain.com>`.

### 3. Vercel
Import the repo, set **Root Directory** to `web`, and add these environment variables:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (server only) |
| `RESEND_API_KEY` | Resend key |
| `RESEND_FROM` | verified sender |
| `SITE_URL` | e.g. `https://seats.example.com` (no trailing slash) |
| `CRON_SECRET` | a long random string (`openssl rand -hex 32`) |
| `NTFY_SERVER` | optional, defaults to `https://ntfy.sh` |

`vercel.json` adds a once-a-day backup check. Vercel sends `CRON_SECRET` automatically.

### 4. Hourly schedule (GitHub Actions)
In the repo's **Settings → Secrets and variables → Actions**:
- add the variable `SITE_URL` (the same value as above)
- add the secret `CRON_SECRET` (the same value as above)

`.github/workflows/hosted-checker.yml` then calls `/api/cron/check` every hour. You can also trigger it by hand from the Actions tab. To check more often during add/drop, edit the cron line in that workflow.

## How checking works
- Each distinct course/term is fetched once per run from the public Visual Schedule Builder data endpoint, no matter how many people watch it.
- A user is alerted when a watched section is open and it either just went from full to open, or this is the first check since they added it.
- Unsubscribe links (including one-click `List-Unsubscribe`) pause all of that user's alerts.
- Each user can watch at most 12 courses.

Not affiliated with McGill University. The app never asks for Minerva credentials.
