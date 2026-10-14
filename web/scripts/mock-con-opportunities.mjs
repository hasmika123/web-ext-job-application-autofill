/**
 * Dev mock for `/api/orgs/{orgId}/con/opportunities/**` (Consultant workspace, doc 60 s3/s4), in memory, DEV ONLY. Only the acme (id 2)
 * consultant (consultant@acme.com) sees it; everyone else, and any other org, gets the API's generic 404. The transitions follow the
 * lifecycle matrix and the DTO carries `allowedActions[]` and `version` like the real API: an `If-Match` that is not the row's version
 * answers 409 VERSION_CONFLICT, a same-target action is a 200 no-op. E1: nothing here applies or submits for anyone; "applied" only records.
 * Try the failure paths from outside: POST /mock/con/opportunities/reset restores the seed, /mock/con/opportunities/{id}/bump raises the
 * server's version (the next write then answers 409), and a question containing "ssn" is refused as sensitive (422).
 */
const MEMBERS = new Set(["consultant@acme.com"]);
const DAY = 86_400_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const day = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
const MIA = { memberId: 102, name: "Mia Marketer" };
const SARAH = { memberId: 103, name: "Sarah Singh" };

const job = (id, title, company, location, workMode, employmentType, payLabel, jobUrl, atsPlatform, externalJobId, skills, postedDaysAgo) => ({
  id, title, company, location, workMode, employmentType, payLabel, jobUrl, atsPlatform, externalJobId,
  postedOn: new Date(Date.now() - postedDaysAgo * DAY).toISOString().slice(0, 10), skills,
});

const seed = () => [
  {
    id: 1, state: "ASSIGNED",
    job: job(11, "Senior Java Developer", "TechCorp", "New York, NY", "HYBRID", "Contract", "$70-80/hr", "https://www.linkedin.com/jobs/view/3912345678/", "linkedin", "3912345678", ["Java", "Spring Boot", "Kafka", "AWS"], 2),
    marketerNote: "Strong fit for your Kafka work. Mention the payments migration. LinkedIn Easy Apply, so press I applied afterwards.",
    assignedBy: MIA, assignedAt: ago(3 * 3600e3), priority: "HIGH", dueOn: day(3), infoRequest: "", infoAnswer: "", appliedAt: null, linkedApplicationId: null, version: 0,
  },
  {
    id: 2, state: "VIEWED",
    job: job(12, "Data Engineer", "Globex", "Remote", "REMOTE", "Full-time", "", "https://www.indeed.com/viewjob?jk=a1b2c3d4e5f60718", "indeed", "a1b2c3d4e5f60718", ["Python", "Airflow", "Snowflake"], 5),
    marketerNote: "Remote and well paid. Resume v5 is the one to use.",
    assignedBy: MIA, assignedAt: ago(26 * 3600e3), priority: "MEDIUM", dueOn: day(7), infoRequest: "", infoAnswer: "", appliedAt: null, linkedApplicationId: null, version: 0,
  },
  {
    id: 3, state: "NEEDS_INFO",
    job: job(13, "Platform Engineer", "Initech", "Austin, TX", "ONSITE", "Contract", "$65/hr", "https://boards.greenhouse.io/initech/jobs/4400123", "greenhouse", "4400123", ["Kubernetes", "Terraform", "Go"], 9),
    marketerNote: "Client wants someone local in Austin.",
    assignedBy: SARAH, assignedAt: ago(2 * DAY), priority: "MEDIUM", dueOn: day(-1), infoRequest: "Is relocation to Austin covered?", infoAnswer: "", appliedAt: null, linkedApplicationId: null, version: 0,
  },
  {
    id: 4, state: "APPLIED",
    job: job(14, "Backend Developer", "Hooli", "San Jose, CA", "HYBRID", "Full-time", "$150k-$170k", "https://boards.greenhouse.io/hooli/jobs/5500456", "greenhouse", "5500456", ["Java", "PostgreSQL"], 14),
    marketerNote: "Applied through the extension last week.",
    assignedBy: MIA, assignedAt: ago(8 * DAY), priority: "LOW", dueOn: null, infoRequest: "", infoAnswer: "", appliedAt: ago(6 * DAY), linkedApplicationId: 55, version: 0,
  },
  {
    id: 5, state: "DECLINED",
    job: job(15, "QA Lead", "Pied Piper", "Palo Alto, CA", "ONSITE", "Contract", "$55/hr", "https://www.indeed.com/viewjob?jk=ffee00112233aabb", "indeed", "ffee00112233aabb", ["Selenium", "Cypress"], 20),
    marketerNote: "Probably too far, but your call.",
    assignedBy: MIA, assignedAt: ago(12 * DAY), priority: "LOW", dueOn: null, infoRequest: "", infoAnswer: "", appliedAt: null, linkedApplicationId: null, version: 0,
  },
];

let rows = seed();

/** What the lifecycle matrix lets the consultant do from this row (doc 60 s3). */
function allowed(r) {
  const open = r.linkedApplicationId === null ? ["LINK"] : [];
  switch (r.state) {
    case "ASSIGNED": return ["VIEWED", "INTEREST", "DECLINE", "REQUEST_INFO", "APPLIED", ...open];
    case "VIEWED": return ["INTEREST", "DECLINE", "REQUEST_INFO", "APPLIED", ...open];
    case "INTERESTED": return ["DECLINE", "REQUEST_INFO", "APPLIED", ...open];
    case "NEEDS_INFO": return ["INTEREST", "DECLINE", "APPLIED", ...open];
    case "DECLINED": return ["INTEREST"];
    case "APPLIED": return r.linkedApplicationId === null ? ["LINK"] : ["UNLINK"];
    default: return [];
  }
}
const dto = (r) => ({ ...r, allowedActions: allowed(r) });

const REASONS = ["NOT_INTERESTED", "LOCATION", "RATE", "ALREADY_APPLIED", "OTHER"];
const SENSITIVE = /\b(ssn|social security|passport)\b|\b\d{3}-\d{2}-\d{4}\b/i;

export function createConOpportunitiesMock({ json, subOf = () => null }) {
  const readBody = (req, cb) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        const v = raw ? JSON.parse(raw) : {};
        cb(v && typeof v === "object" && !Array.isArray(v) ? v : null);
      } catch {
        cb(null);
      }
    });
  };
  const problem = (res, status, code, message) => json(res, status, { status, code, detail: message, title: message });

  return function handle(req, res, path, method) {
    // dev-only knobs
    const knob = /^\/mock\/con\/opportunities\/(reset|\d+\/bump)$/.exec(path);
    if (knob && method === "POST") {
      req.resume();
      if (knob[1] === "reset") rows = seed();
      else {
        const r = rows.find((x) => x.id === Number(knob[1].split("/")[0]));
        if (r) r.version += 1;
      }
      return json(res, 200, { ok: true }), true;
    }

    const m = /^\/api\/orgs\/(\d+)\/con\/opportunities(?:\/(\d+)(?:\/(viewed|interest|decline|request-info|applied|link|unlink))?)?$/.exec(path);
    if (!m) return false;
    const login = subOf(req);
    if (Number(m[1]) !== 2 || !login || !MEMBERS.has(login)) {
      req.resume();
      return problem(res, 404, "NOT_FOUND", "Not found"), true;
    }
    const id = m[2] ? Number(m[2]) : null;
    const act = m[3] ?? null;
    const r = id === null ? null : rows.find((x) => x.id === id);

    if (method === "GET" && id === null) {
      req.resume();
      const url = new URL(req.url ?? path, "http://mock.local");
      const state = url.searchParams.get("state");
      const states = state ? state.split(",") : null;
      const size = Math.min(100, Number(url.searchParams.get("size") ?? 20) || 20);
      const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);
      const all = rows.filter((x) => !states || states.includes(x.state));
      return json(res, 200, { items: all.slice(page * size, page * size + size).map(dto), total: all.length }), true;
    }
    if (method === "GET") {
      req.resume();
      return r ? json(res, 200, dto(r)) : problem(res, 404, "NOT_FOUND", "Not found"), true;
    }
    if (method !== "POST" || !act) {
      req.resume();
      return problem(res, 404, "NOT_FOUND", "Not found"), true;
    }
    readBody(req, (body) => {
      if (!r) return problem(res, 404, "NOT_FOUND", "Not found");
      if (body === null) return problem(res, 400, "VALIDATION", "Send a JSON object.");
      const key = req.headers["idempotency-key"];
      if (typeof key !== "string" || !key) return problem(res, 400, "IDEMPOTENCY_KEY_MISSING", "Send an Idempotency-Key header.");
      const ifMatch = req.headers["if-match"];
      if (ifMatch !== undefined && Number(ifMatch) !== r.version) return problem(res, 409, "VERSION_CONFLICT", "This job changed. Reload and try again.");
      const kind = { viewed: "VIEWED", interest: "INTEREST", decline: "DECLINE", "request-info": "REQUEST_INFO", applied: "APPLIED", link: "LINK", unlink: "UNLINK" }[act];
      if (!allowed(r).includes(kind)) {
        // same target = 200 no-op (contract s2); anything else the matrix refuses
        const same = { viewed: "VIEWED", interest: "INTERESTED", decline: "DECLINED", applied: "APPLIED" }[act];
        if (same && r.state === same) return json(res, 200, dto(r));
        return problem(res, 409, "ILLEGAL_TRANSITION", "That isn't possible from here.");
      }
      switch (act) {
        case "viewed": r.state = "VIEWED"; break;
        case "interest": r.state = "INTERESTED"; break;
        case "decline": {
          if (!REASONS.includes(body.reason)) return problem(res, 400, "VALIDATION", "Pick a reason from the list.");
          if (typeof body.note === "string" && body.note.length > 200) return problem(res, 400, "VALIDATION", "The note is limited to 200 characters.");
          if (typeof body.note === "string" && SENSITIVE.test(body.note)) return problem(res, 422, "SENSITIVE_CONTENT", "This looks like it contains sensitive personal data. We never store it, so please remove it.");
          r.state = "DECLINED";
          break;
        }
        case "request-info": {
          const q = typeof body.question === "string" ? body.question.trim() : "";
          if (q.length < 1 || q.length > 500) return problem(res, 400, "VALIDATION", "The question must be 1 to 500 characters.");
          if (SENSITIVE.test(q)) return problem(res, 422, "SENSITIVE_CONTENT", "This looks like it contains sensitive personal data. We never store it, so please remove it.");
          r.state = "NEEDS_INFO";
          r.infoRequest = q;
          r.infoAnswer = "";
          break;
        }
        case "applied":
        case "link": {
          if (act === "link" && !Number.isInteger(body.applicationId)) return problem(res, 400, "VALIDATION", "Pick an application to link.");
          r.state = "APPLIED";
          r.appliedAt = r.appliedAt ?? new Date().toISOString();
          if (Number.isInteger(body.applicationId)) r.linkedApplicationId = body.applicationId;
          break;
        }
        case "unlink": r.linkedApplicationId = null; break;
      }
      r.version += 1;
      return json(res, 200, dto(r));
    });
    return true;
  };
}
