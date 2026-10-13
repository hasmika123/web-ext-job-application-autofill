/**
 * Dev mock for `GET /api/orgs/{orgId}/mkt/talent[/{id}]`, `POST .../views`, `DELETE .../views/{id}` (Marketing workspace, "My Assigned Talent").
 * The rows are the approved board's: 28 assigned consultants (the 8 table rows and the 6 extra bottom-card names of the board, plus
 * 14 invented ones so that the chip counts are the board's 28 / 12 / 8 / 6 / 5). Counts, filters, paging and facets are computed from
 * the rows, as the real API does. Only acme (id 2) members who hold the marketing grants see it; anyone else gets the API's 404.
 * `canAddConsultant` is true for the manager login only (the real API answers it from `consultants.edit`).
 */
const MEMBERS = new Set(["marketer@acme.com", "sarah@acme.com", "demo-ent-acme-omar", "demo-ent-acme-sarah"]);
const CAN_ADD = new Set(["sarah@acme.com", "demo-ent-acme-sarah"]);
const ART = "/ent/marketer/talent";

// [id, name, title, primarySkill, years, location, availCode, availLabel, apps, jobs, photo, flags]
// flags: iv = in interview, needs = resume needs update, pend = resume pending approval
const RAW = [
  [1, "Alex Morgan", "Senior Java Developer", "Java / Spring", 8, "New York, NY", "AVAILABLE_NOW", "Available Now", 5, 3, "alex-morgan", ""],
  [2, "Priya Sharma", "Business Analyst", "Business Analysis", 6, "Austin, TX", "AVAILABLE_NOW", "Available Now", 3, 2, "priya-sharma", ""],
  [3, "Michael Park", "AWS Engineer", "AWS / Cloud", 7, "Seattle, WA", "SOON", "1 week", 4, 4, "michael-park", ""],
  [4, "Emily Lawson", "Project Manager", "Program Management", 9, "Chicago, IL", "SOON", "2 weeks", 2, 3, "emily-lawson", "needs"],
  [5, "David Kim", "Data Analyst", "Data Analytics", 4, "Remote", "AVAILABLE_NOW", "Available Now", 6, 2, "david-kim", ""],
  [6, "Sophia Patel", "Salesforce Consultant", "Salesforce", 6, "Denver, CO", "SOON", "1 month", 3, 1, "sophia-patel", ""],
  [7, "James Chen", "DevOps Engineer", "DevOps / Kubernetes", 5, "San Francisco, CA", "AVAILABLE_NOW", "Available Now", 5, 4, "james-chen", "needs"],
  [8, "Olivia Brooks", "UX Designer", "UX / UI Design", 7, "Boston, MA", "IN_INTERVIEW", "In Interview", 2, 2, "olivia-brooks", "iv"],
  [9, "Lisa Wong", "QA Automation Engineer", "QA Automation", 6, "Austin, TX", "AVAILABLE_NOW", "Available Now", 3, 2, "lisa-wong", ""],
  [10, "Kevin Liu", "Data Engineer", "Data Engineering", 7, "Seattle, WA", "SOON", "2 weeks", 3, 2, "kevin-liu", "needs"],
  [11, "Maria Garcia", "Solutions Architect", "Solution Architecture", 10, "Dallas, TX", "SOON", "1 month", 2, 1, "maria-garcia", "needs"],
  [12, "Ryan Taylor", "Cloud Architect", "Cloud Architecture", 8, "New York, NY", "IN_INTERVIEW", "In Interview", 4, 3, "ryan-taylor", "iv"],
  [13, "Nina Kapoor", "Business Analyst", "Business Analysis", 5, "Atlanta, GA", "IN_INTERVIEW", "In Interview", 3, 2, "nina-kapoor", "iv"],
  [14, "Daniel Wright", "Product Owner", "Product Management", 6, "Remote", "IN_INTERVIEW", "In Interview", 2, 2, "daniel-wright", "iv"],
  [15, "Grace Nguyen", "Frontend Developer", "React / TypeScript", 5, "Portland, OR", "AVAILABLE_NOW", "Available Now", 2, 1, null, "pend"],
  [16, "Ethan Brooks", "Backend Developer", "Node.js", 3, "Austin, TX", "AVAILABLE_NOW", "Available Now", 1, 1, null, "pend"],
  [17, "Hannah Lee", "Scrum Master", "Agile Delivery", 9, "Chicago, IL", "AVAILABLE_NOW", "Available Now", 3, 2, null, "pend"],
  [18, "Marcus Reed", "Security Analyst", "Cybersecurity", 8, "Washington, DC", "AVAILABLE_NOW", "Available Now", 2, 2, null, ""],
  [19, "Isabel Torres", "Data Scientist", "Machine Learning", 4, "Remote", "AVAILABLE_NOW", "Available Now", 4, 3, null, ""],
  [20, "Tom Becker", ".NET Developer", "C# / .NET", 11, "Columbus, OH", "AVAILABLE_NOW", "Available Now", 1, 0, null, ""],
  [21, "Aisha Khan", "Product Analyst", "SQL / Tableau", 2, "Remote", "AVAILABLE_NOW", "Available Now", 2, 1, null, ""],
  [22, "Oscar Diaz", "Network Engineer", "Networking", 12, "Miami, FL", "IN_INTERVIEW", "In Interview", 3, 2, null, "iv pend"],
  [23, "Chloe Martin", "Mobile Developer", "iOS / Swift", 6, "Los Angeles, CA", "IN_INTERVIEW", "In Interview", 2, 2, null, "iv pend"],
  [24, "Victor Hale", "SAP Consultant", "SAP", 10, "Houston, TX", "IN_INTERVIEW", "In Interview", 4, 3, null, "iv"],
  [25, "Zoe Adams", "ETL Developer", "Informatica", 5, "Phoenix, AZ", "IN_INTERVIEW", "In Interview", 1, 1, null, "iv"],
  [26, "Leo Fischer", "Java Developer", "Java / Spring", 3, "Denver, CO", "SOON", "1 month", 1, 1, null, "needs"],
  [27, "Mia Rossi", "Technical Writer", "Documentation", 1, "Remote", "SOON", "2 weeks", 0, 0, null, "needs"],
  [28, "Noah Evans", "Release Manager", "Release Engineering", 13, "Boston, MA", "ON_PROJECT", "On Project", 1, 1, null, ""],
];

const TONE = { AVAILABLE_NOW: "green", IN_INTERVIEW: "violet", SOON: "blue", LATER: "blue", ON_PROJECT: "amber", UNAVAILABLE: "grey" };
const ROWS = RAW.map(([id, name, title, primarySkill, yearsExperience, location, code, label, activeApps, assignedJobs, photo, flags]) => {
  const f = flags.split(" ");
  const state = f.includes("needs") ? "NEEDS_UPDATE" : f.includes("pend") ? "PENDING_APPROVAL" : "UP_TO_DATE";
  return {
    id, name, avatarUrl: photo ? `${ART}/${photo}.png` : null, title, primarySkill, yearsExperience, location,
    availability: { code, label, tone: TONE[code] },
    resume: { state, label: state === "NEEDS_UPDATE" ? "Needs Update" : state === "PENDING_APPROVAL" ? "Pending Approval" : "Up to date" },
    activeApps, assignedJobs,
    _iv: f.includes("iv"), _needs: f.includes("needs"), _pend: f.includes("pend"), _skills: primarySkill.split(" / "),
  };
});
const pub = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith("_")));

const band = (y, b) => (b === "0-2" ? y <= 2 : b === "3-5" ? y >= 3 && y <= 5 : b === "6-8" ? y >= 6 && y <= 8 : b === "9+" ? y >= 9 : true);
const sparks = {
  assigned: [14, 16, 17, 19, 21, 23, 25, 28], availableNow: [4, 5, 6, 6, 8, 9, 10, 12], needUpdates: [11, 10, 10, 9, 8, 7, 7, 6],
  activeInterviews: [3, 4, 4, 5, 6, 6, 7, 8], pendingApprovals: [9, 8, 8, 7, 7, 6, 6, 5],
};
const DELTAS = { assigned: 12, availableNow: 33, needUpdates: -40, activeInterviews: 60, pendingApprovals: -29 };

const views = []; // saved views live in memory only
let nextViewId = 1;

function board(url, login) {
  const q = url.searchParams;
  const get = (k) => (q.get(k) || "").trim();
  const status = get("status"), skill = get("skill").toLowerCase(), location = get("location").toLowerCase(), exp = get("experience"), av = get("availability"), text = get("q").toLowerCase();
  const filtered = ROWS.filter((r) => {
    if (status === "AVAILABLE_NOW" && r.availability.code !== "AVAILABLE_NOW") return false;
    if (status === "IN_INTERVIEW" && !r._iv) return false;
    if (status === "NEEDS_UPDATE" && !r._needs) return false;
    if (status === "PENDING_APPROVAL" && !r._pend) return false;
    if (skill && !r._skills.some((s) => s.toLowerCase() === skill)) return false;
    if (location && r.location.toLowerCase() !== location) return false;
    if (exp && !band(r.yearsExperience, exp)) return false;
    if (av && r.availability.code !== av) return false;
    if (text && ![r.name, r.title, r.location, ...r._skills].some((s) => s.toLowerCase().includes(text))) return false;
    return true;
  });
  const size = Math.min(100, Math.max(1, Number(q.get("size")) || 8));
  const page = Math.max(0, Number(q.get("page")) || 0);
  const count = (fn) => ROWS.filter(fn).length;
  const counts = { all: ROWS.length, availableNow: count((r) => r.availability.code === "AVAILABLE_NOW"), inInterview: count((r) => r._iv), needsUpdate: count((r) => r._needs), pendingApproval: count((r) => r._pend) };
  const values = { assigned: counts.all, availableNow: counts.availableNow, needUpdates: counts.needsUpdate, activeInterviews: counts.inInterview, pendingApprovals: counts.pendingApproval };
  return {
    kpis: Object.keys(values).map((key) => ({ key, value: values[key], deltaPct: DELTAS[key], sparkline: sparks[key] })),
    counts,
    facets: { skills: [...new Set(ROWS.flatMap((r) => r._skills))].sort(), locations: [...new Set(ROWS.map((r) => r.location))].sort() },
    items: filtered.slice(page * size, page * size + size).map(pub),
    total: filtered.length, page, size,
    cards: {
      available: [1, 5, 7, 9].map((id) => pub(ROWS.find((r) => r.id === id))), // the board's four (the real API lists the first four by name)
      needsUpdate: ROWS.filter((r) => r._needs).slice(0, 4).map(pub),
      inInterview: ROWS.filter((r) => r._iv).slice(0, 4).map(pub),
    },
    views,
    canAddConsultant: CAN_ADD.has(login),
  };
}

function detail(r) {
  const days = (n) => new Date(Date.now() - n * 864e5).toISOString();
  return {
    ...pub(r), headline: `${r.title} with ${r.yearsExperience} years of experience`, workMode: r.location === "Remote" ? "REMOTE" : "HYBRID",
    profileCompleteness: 70 + (r.id % 5) * 6, skills: [...r._skills, "Communication", "Agile"],
    resumes: [{ id: r.id * 10, name: `${r.name.split(" ")[0]} - ${r.title}`, version: 3, primary: true, approval: r._pend ? "PENDING" : "APPROVED", updatedAt: days(r._needs ? 140 : 6) }],
    applications: [
      { code: `APP-2026-${100 + r.id}`, jobTitle: "Senior Java Developer", client: "TechCorp", stage: "UNDER_REVIEW", nextAction: "Follow up with the recruiter" },
      { code: `APP-2026-${200 + r.id}`, jobTitle: "Data Analyst", client: "Global Media", stage: "SUBMITTED", nextAction: "" },
    ].slice(0, Math.max(0, Math.min(2, r.activeApps))),
    interviews: r._iv ? [{ scheduledAt: new Date(Date.now() + 2 * 864e5).toISOString(), round: "Technical", client: "TechCorp", durationMinutes: 45 }] : [],
    assignedJobs: [{ jobId: 11, title: "Senior Java Developer", client: "TechCorp", matchPct: 92 }, { jobId: 12, title: "Data Analyst", client: "Global Media", matchPct: 88 }].slice(0, Math.min(2, r.assignedJobs)),
    consent: "SUMMARY",
  };
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve(null);
      }
    });
  });
}

export function createMktTalentMock({ json, subOf = () => null }) {
  return function handle(req, res, path, method) {
    const m = /^\/api\/orgs\/(\d+)\/mkt\/talent(?:\/(views)(?:\/(\d+))?|\/(\d+))?$/.exec(path);
    if (!m) return false;
    const login = subOf(req);
    if (Number(m[1]) !== 2 || !login || !MEMBERS.has(login)) return req.resume(), json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    const url = new URL(req.url, "http://mock");
    if (m[2] === "views") {
      if (method === "POST" && !m[3]) {
        readJson(req).then((b) => {
          const name = typeof b?.name === "string" ? b.name.trim() : "";
          if (!name || name.length > 60) return json(res, 422, { status: 422, code: "ORG_INVALID", message: "Give the view a name of 1 to 60 characters." });
          const filters = { q: b.q || "", status: b.status || "", skill: b.skill || "", location: b.location || "", experience: b.experience || "", availability: b.availability || "" };
          const have = views.find((v) => v.name === name);
          const view = have ? Object.assign(have, { filters }) : (views.push({ id: nextViewId++, name, filters }), views[views.length - 1]);
          json(res, 201, view);
        });
        return true;
      }
      if (method === "DELETE" && m[3]) {
        req.resume();
        const i = views.findIndex((v) => v.id === Number(m[3]));
        if (i < 0) return json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
        views.splice(i, 1);
        res.writeHead(204).end();
        return true;
      }
      req.resume();
      return json(res, 405, { status: 405 }), true;
    }
    req.resume();
    if (method !== "GET") return json(res, 405, { status: 405 }), true;
    if (m[4]) {
      const r = ROWS.find((x) => x.id === Number(m[4]));
      return r ? json(res, 200, detail(r)) : json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    }
    return json(res, 200, board(url, login)), true;
  };
}
