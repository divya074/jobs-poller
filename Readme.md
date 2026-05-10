# Microsoft Jobs Poller

Polls Microsoft's careers page every minute and emails you when new Software Engineering jobs are posted in the US.

---

## Setup (takes ~10 minutes)

### Step 1 — Get a Gmail App Password

Gmail blocks plain password login for scripts. You need an **App Password**:

1. Go to https://myaccount.google.com/security
2. Enable **2-Step Verification** (required)
3. Go to https://myaccount.google.com/apppasswords
4. Select app: **Mail** → device: **Other** → name it "jobs-poller"
5. Copy the 16-character password (e.g. `abcd efgh ijkl mnop`)

### Step 2 — Deploy to Deno Deploy (free)

1. Push this folder to a GitHub repo
2. Go to https://deno.com/deploy → **New Project**
3. Connect your GitHub repo
4. Set **Entry point** to `main.ts`
5. Add these **Environment Variables**:

| Key | Value |
|---|---|
| `GMAIL_USER` | your Gmail address (e.g. `you@gmail.com`) |
| `GMAIL_APP_PASS` | the 16-char app password from Step 1 |
| `NOTIFY_EMAIL` | email to send alerts to (can be same as above) |

6. Click **Deploy** ✅

### Step 3 — Verify it works

- Your Deno Deploy URL (e.g. `https://your-project.deno.dev`) will show a JSON status page
- On first run it seeds existing jobs (no email sent)
- When Microsoft posts a new job, you'll get an email within 1 minute

---

## How it works

- `Deno.cron("* * * * *", ...)` runs the poll every 60 seconds
- First run seeds all current jobs so you don't get spammed with old listings
- New job IDs are stored in memory — if the process restarts, it re-seeds
- Email is sent via Gmail SMTP with TLS (port 465)

---

## Limitations

- In-memory deduplication resets if Deno Deploy restarts the process (rare, but you might get a re-send of recent jobs)
- For persistent deduplication, add a free KV store (Deno KV is built-in — ask Claude to add it!)
- Microsoft's careers API is unofficial and could change