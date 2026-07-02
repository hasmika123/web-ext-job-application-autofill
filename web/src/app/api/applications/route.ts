import { serverApiFetch } from "@/lib/api";

/**
 * Create a tracked application by hand, proxied to Spring's user-scoped
 * `POST /api/profile/applications` (an upsert). This is the "add a job to the board
 * without the extension" path: the board's "Add application" form posts here. Server
 * owns createdAt/updatedAt/user; we only forward the fields a person can fill in.
 */
const STATUSES = ["DRAFT", "SAVED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"];
// Strict enums, mirrored from the backend JobType / JobMode.
const JOB_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "TEMPORARY", "OTHER"];
const JOB_MODES = ["ON_SITE", "HYBRID", "REMOTE", "OTHER"];

type PostBody = {
  company?: unknown;
  roleTitle?: unknown;
  status?: unknown;
  jobUrl?: unknown;
  location?: unknown;
  jobType?: unknown;
  jobMode?: unknown;
  email?: unknown;
  salary?: unknown;
  jobDescription?: unknown;
  resumeId?: unknown;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** A positive integer resume id, or null. Accepts a number or numeric string. */
function resumeId(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as PostBody | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const company = str(body.company);
  const roleTitle = str(body.roleTitle);
  if (!company || !roleTitle) {
    return Response.json({ error: "Company and role title are required." }, { status: 400 });
  }

  const forward: Record<string, unknown> = { company, roleTitle, source: "manual" };
  const status = str(body.status) || "SAVED";
  if (!STATUSES.includes(status)) {
    return Response.json({ error: "Invalid status." }, { status: 400 });
  }
  forward.status = status;
  if (status === "APPLIED") forward.appliedAt = new Date().toISOString();

  const jobUrl = str(body.jobUrl);
  const location = str(body.location);
  const jobDescription = str(body.jobDescription);
  if (jobUrl) forward.jobUrl = jobUrl;
  if (location) forward.location = location;
  if (jobDescription) forward.jobDescription = jobDescription;

  // Job type / mode are strict enums; reject unknown values, omit when blank.
  const jobType = str(body.jobType);
  if (jobType) {
    if (!JOB_TYPES.includes(jobType)) return Response.json({ error: "Invalid job type." }, { status: 400 });
    forward.jobType = jobType;
  }
  const jobMode = str(body.jobMode);
  if (jobMode) {
    if (!JOB_MODES.includes(jobMode)) return Response.json({ error: "Invalid job mode." }, { status: 400 });
    forward.jobMode = jobMode;
  }
  // Email: forward if provided, else the backend defaults it to the user's profile email.
  const email = str(body.email).slice(0, 254);
  if (email) forward.email = email;
  const salary = str(body.salary).slice(0, 100);
  if (salary) forward.salary = salary;
  const rid = resumeId(body.resumeId);
  if (rid) forward.resume = { id: rid }; // Spring links it only if the current user owns it



  let res: Response;
  try {
    res = await serverApiFetch("/api/profile/applications", {
      method: "POST",
      body: JSON.stringify(forward),
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }

  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (!res.ok) {
    return Response.json({ error: "Couldn't add the application." }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  return Response.json({ ok: true, application: data });
}
