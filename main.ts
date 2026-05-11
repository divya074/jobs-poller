/// <reference lib="deno.ns" />

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const NOTIFY_EMAIL = Deno.env.get("NOTIFY_EMAIL")!;

// ─── DENO KV (persistent storage) ─────────────────────────────────────────────
const kv = await Deno.openKv();

// ─── STATE ────────────────────────────────────────────────────────────────────
let totalSeenJobs = 0;

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Job {
  id: number;
  name: string;
  locations: string[];
  standardizedLocations: string[];
  postedTs: number;
  department: string;
  workLocationOption: string;
  positionUrl: string;
}

// ─── KV HELPERS ───────────────────────────────────────────────────────────────
async function isJobSeen(jobId: number): Promise<boolean> {
  const entry = await kv.get(["seen_jobs", jobId]);
  return entry.value !== null;
}

async function markJobSeen(jobId: number): Promise<void> {
  await kv.set(["seen_jobs", jobId], true);
  totalSeenJobs++;
}

// ─── MICROSOFT CAREERS API ────────────────────────────────────────────────────
async function fetchJobs(query: string): Promise<Job[]> {
  const params = new URLSearchParams({
    domain: "microsoft.com",
    query,
    location: "united states",
    start: "0",
    sort_by: "timestamp",
    filter_include_remote: "1",
    filter_profession: "software engineering",
    filter_career_discipline: "Software Engineering",
  });

  const res = await fetch(
    `https://apply.careers.microsoft.com/api/pcsx/search?${params}`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://apply.careers.microsoft.com/",
      },
    }
  );

  const contentType = res.headers.get("content-type");
  console.log(`[${query}] API status: ${res.status}, content-type: ${contentType}`);

  if (!res.ok) throw new Error(`Microsoft API error (${query}): ${res.status}`);

  const data = await res.json();
  return data?.data?.positions ?? [];
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
      from: "onboarding@resend.dev",
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
          <a href="https://apply.careers.microsoft.com${job.positionUrl}"
             style="text-decoration:none;color:#0078d4;">
            ${job.name}
          </a>
        </h2>
        <p style="margin:0 0 4px;color:#555;font-size:14px;">
          📍 ${job.standardizedLocations?.[0] ?? job.locations?.[0] ?? "Unknown Location"}
        </p>
        <p style="margin:0 0 4px;color:#555;font-size:14px;">
          🏢 Microsoft &nbsp;·&nbsp; ${job.department}
        </p>
        <p style="margin:0 0 4px;color:#555;font-size:14px;">
          💻 ${job.workLocationOption === "remote" ? "Remote" : job.workLocationOption === "hybrid" ? "Hybrid" : "On-site"}
        </p>
        <p style="margin:0 0 8px;color:#555;font-size:14px;">
          📅 Posted: ${formatDate(job.postedTs)}
        </p>
        <a href="https://apply.careers.microsoft.com${job.positionUrl}"
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

function formatDate(unixTs: number): string {
  return new Date(unixTs * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── POLL LOGIC ───────────────────────────────────────────────────────────────
async function poll() {
  try {
    console.log(`[${new Date().toISOString()}] Polling Microsoft Careers...`);

    // Fetch IC2 and IC3 jobs in parallel
    const [ic2Jobs, ic3Jobs] = await Promise.all([
      fetchJobs("IC2"),
      fetchJobs("IC3"),
    ]);

    console.log(`Fetched IC2: ${ic2Jobs.length} jobs, IC3: ${ic3Jobs.length} jobs`);

    // Merge and deduplicate by job ID
    const allJobsMap = new Map<number, Job>();
    for (const job of [...ic2Jobs, ...ic3Jobs]) {
      allJobsMap.set(job.id, job);
    }
    const allJobs = Array.from(allJobsMap.values());
    console.log(`Total unique jobs: ${allJobs.length}`);

    // Exclude CTJ - Poly jobs
    const filteredJobs = allJobs.filter((j) => !j.name.includes("CTJ - Poly"));
    console.log(`Jobs after excluding CTJ - Poly: ${filteredJobs.length}`);

    // Filter to last 5 minutes
    const cutoff = Math.floor(Date.now() / 1000) - 5 * 60;
    const recentJobs = filteredJobs.filter((j) => j.postedTs >= cutoff);
    console.log(`Recent jobs (within 5 minutes): ${recentJobs.length}`);

    // Check KV for each job to find truly new ones
    const newJobs: Job[] = [];
    for (const job of recentJobs) {
      const seen = await isJobSeen(job.id);
      if (!seen) newJobs.push(job);
    }

    // Mark all fetched jobs as seen in KV
    for (const job of allJobs) {
      await markJobSeen(job.id);
    }

    console.log(`New unseen jobs: ${newJobs.length}`);

    if (newJobs.length === 0) {
      console.log("No new jobs found.");
      return;
    }

    console.log(`Sending email for ${newJobs.length} new job(s)...`);
    await sendEmail(newJobs);
  } catch (err) {
    console.error("Poll error:", err);
  }
}

// ─── CRON (every minute) ──────────────────────────────────────────────────────
Deno.cron("poll-microsoft-jobs", "* * * * *", poll);

// ─── HTTP SERVER ──────────────────────────────────────────────────────────────
Deno.serve(() =>
  new Response(
    JSON.stringify({
      status: "running",
      seenJobs: totalSeenJobs,
      lastCheck: new Date().toISOString(),
    }),
    { headers: { "Content-Type": "application/json" } }
  )
);