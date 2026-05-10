# Microsoft Jobs Poller

Polls Microsoft's careers page every minute and emails you when new Software Engineering jobs are posted in the US within the last 5 minutes.

---

## How it works

- Runs every minute via `Deno.cron`
- Fetches the 20 most recent Software Engineering jobs from Microsoft's careers API
- Filters jobs posted in the **last 5 minutes** that haven't been seen before
- Sends an email via **Resend** if any new jobs are found
- No email = no new jobs that minute

---

## Setup

### Step 1 — Get a Resend API key

1. Go to [resend.com](https://resend.com) and sign up (free, no credit card)
2. Go to **API Keys** → **Create API Key**
3. Copy the key (starts with `re_...`)

### Step 2 — Deploy to Deno Deploy

1. Push this repo to GitHub
2. Go to [deno.com/deploy](https://deno.com/deploy) → **New Project**
3. Connect your GitHub repo
4. Set entry point to `main.ts`
5. Go to **Settings → Environment Variables** and add:

| Key | Value |
|---|---|
| `RESEND_API_KEY` | your `re_...` key from Resend |
| `NOTIFY_EMAIL` | email address to receive alerts |

6. Click **Deploy** ✅

### Step 3 — Verify

Visit your Deno Deploy project URL — you'll see:
```json
{ "status": "running", "seenJobs": 20, "lastCheck": "2026-05-10T..." }
```

---

## Test locally

```bash
export RESEND_API_KEY="re_xxxxxxxx"
export NOTIFY_EMAIL="you@gmail.com"
deno run --allow-net --allow-env --unstable-cron main.ts
```

> Note: The Microsoft API call may fail locally due to a certificate issue — this is a local-only problem and works fine on Deno Deploy.

---

## Environment Variables

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key for sending emails |
| `NOTIFY_EMAIL` | Email address to send job alerts to |

---

## Tech Stack

- **Runtime**: Deno
- **Hosting**: Deno Deploy (free)
- **Email**: Resend (free, 3000 emails/month)
- **Scheduler**: `Deno.cron` (built-in)