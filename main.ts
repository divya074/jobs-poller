/// <reference lib="deno.ns" />

// ─── CONFIG (set these as env vars) ───────────────────────────────────────────
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;  // from resend.com
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL")!;       // who to send to

// ─── STATE ────────────────────────────────────────────────────────────────────
const seenJobIds = new Set<string>();

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Job {
  jobId: string;
  title: string;
  primaryLocation?: string;
  organization?: string;
  employmentType?: string;
  postingDate?: string;
  jobSummary?: string;
}

// ─── MICROSOFT CAREERS API ────────────────────────────────────────────────────
async function fetchJobs(): Promise<Job[]> {
  const params = new URLSearchParams({
    q: "",
    lc: "United States",
    l: "en_us",
    pg: "1",
    pgSz: "20",
    o: "Recent",
    flt: "true",
  });

  const res = await fetch(
    `https://jobs.careers.microsoft.com/global/en/search?${params}`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) throw new Error(`Microsoft API error: ${res.status}`);

  const data = await res.json();
  return data?.operationResult?.result?.jobs ?? [];
}

// ─── EMAIL SENDER ─────────────────────────────────────────────────────────────
async function sendEmail(jobs: Job[]) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "onboarding@resend.dev",  // swap for your domain once verified
      to: NOTIFY_EMAIL,
      subject: `🚀 ${jobs.length} New Microsoft SWE Job${jobs.length > 1 ? "s" : ""} Posted`,
      html: buildEmailHtml(jobs),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }

  console.log(`📧 Email sent for ${jobs.length} new job(s)`);
}

// ─── EMAIL TEMPLATE ───────────────────────────────────────────────────────────
function buildEmailHtml(jobs: Job[]): string {
  const jobCards = jobs
    .map(
      (job) => `
      <div style="border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:16px;">
        <h2 style="margin:0 0 6px;font-size:18px;">
          <a href="https://jobs.careers.microsoft.com/global/en/job/${job.jobId}"
             style="text-decoration:none;color:#0078d4;">
            ${job.title}
          </a>
        </h2>
        <p style="margin:0 0 4px;color:#555;font-size:14px;">
          📍 ${job.primaryLocation ?? "Remote / Multiple Locations"}
        </p>
        <p style="margin:0 0 4px;color:#555;font-size:14px;">
          🏢 ${job.organization ?? "Microsoft"}
          ${job.employmentType ? `&nbsp;·&nbsp;${job.employmentType}` : ""}
        </p>
        <p style="margin:0 0 8px;color:#555;font-size:14px;">
          📅 Posted: ${formatDate(job.postingDate)}
        </p>
        ${
          job.jobSummary
            ? `<p style="margin:0;color:#333;font-size:14px;line-height:1.5;">
                 ${job.jobSummary.slice(0, 300)}${job.jobSummary.length > 300 ? "…" : ""}
               </p>`
            : ""
        }
        <a href="https://jobs.careers.microsoft.com/global/en/job/${job.jobId}"
           style="display:inline-block;margin-top:12px;padding:8px 16px;background:#0078d4;color:#fff;border-radius:4px;text-decoration:none;font-size:14px;">
          View Job →
        </a>
      </div>`
    )
    .join("");

  return `
    <div style="max-width:640px;margin:auto;font-family:sans-serif;">
      <div style="background:#0078d4;padding:20px 24px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:22px;">
          🔍 New Microsoft Software Engineering Jobs
        </h1>
        <p style="margin:6px 0 0;color:#cce4f7;font-size:14px;">
          ${jobs.length} new job${jobs.length > 1 ? "s" : ""} found · ${new Date().toUTCString()}
        </p>
      </div>
      <div style="padding:20px 0;">
        ${jobCards}
      </div>
      <p style="color:#aaa;font-size:12px;text-align:center;">
        You're receiving this because you set up Microsoft Jobs Poller on Deno Deploy.
      </p>
    </div>
  `;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "Unknown";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── POLL LOGIC ───────────────────────────────────────────────────────────────
async function poll() {
  try {
    console.log(`[${new Date().toISOString()}] Polling Microsoft Careers...`);
    const jobs = await fetchJobs();

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const newJobs = jobs.filter((j) => {
      // Must be posted within last 5 minutes
      const isRecent = j.postingDate && new Date(j.postingDate) >= fiveMinutesAgo;
      // Must not have been seen in a previous poll
      const isNew = !seenJobIds.has(j.jobId);
      return isRecent && isNew;
    });

    // Always update seen list with everything fetched this round
    jobs.forEach((j) => seenJobIds.add(j.jobId));

    if (newJobs.length === 0) {
      console.log("No new jobs in the last 5 minutes.");
      return;
    }

    console.log(`Found ${newJobs.length} new job(s) — sending email...`);
    await sendEmail(newJobs);
  } catch (err) {
    console.error("Poll error:", err);
  }
}

// ─── CRON (every minute) ──────────────────────────────────────────────────────
Deno.cron("poll-microsoft-jobs", "* * * * *", poll);

// ─── HTTP SERVER (keeps Deno Deploy alive + status check) ────────────────────
Deno.serve(() =>
  new Response(
    JSON.stringify({
      status: "running",
      seenJobs: seenJobIds.size,
      lastCheck: new Date().toISOString(),
    }),
    { headers: { "Content-Type": "application/json" } }
  )
);
