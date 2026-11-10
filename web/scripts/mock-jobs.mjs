/**
 * The job search half of the local demo mock (DEV ONLY; APP-E2E U4.0 / U4.5 / U4.8). Imported by `mock-api.mjs`, which
 * hands it its own helpers. In memory and writable (like the tracker mock), it speaks the same contract as
 * `JobSearchResource`:
 *
 *   GET    /api/jobs/search?q&loc&remote&type&posted&company&sort&page&size
 *            -> {items, total, page, size, capped, tookMs, facets{remote,type,postedBuckets}, suggestions[{label,params,total}]}
 *   GET    /api/jobs/suggest?q            -> [title]
 *   GET    /api/jobs/:id                  -> {card, descriptionText, url, applyUrl, companyJobsCount, similar}
 *   POST   /api/jobs/:id/save             -> {applicationId}   (a SAVED application in the shared tracker mock)
 *   POST   /api/jobs/:id/feedback         {signal: HIDE|HIDE_COMPANY} -> 201 {signal, archivedApplicationId}
 *   DELETE /api/jobs/:id/feedback/:signal -> 204
 *
 * The 60 postings are FICTIONAL (made-up companies, example.com links), the same shape and spread as the API's demo seed
 * (`DemoJobSeeder`). Postings are public, so every account (a brand-new one too) searches them; what an account hides and
 * saves is its own. Limits mirror the server defaults (page size 20 / max 30, query 120 characters, posted 1/3/7/14/30).
 */

const HOUR = 3_600_000;
const SIZE = { default: 20, max: 30, maxQuery: 120, maxFilter: 80, relaxBelow: 5, relaxMax: 3, similarMax: 5, suggestMax: 8, suggestMin: 2 };
const POSTED = [1, 3, 7, 14, 30];
const TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP"];
const STOP = new Set(["a", "about", "an", "are", "as", "at", "be", "by", "com", "de", "en", "for", "from", "how", "i", "in", "is", "it", "la", "of", "on", "or", "that", "the", "this", "to", "was", "what", "when", "where", "who", "will", "with", "und", "www"]);

const ROLES = [
  ["Product Designer", "Design", "Full-time", ["Figma", "prototyping", "user research", "design systems"]],
  ["Senior Product Designer", "Design", "Full-time", ["Figma", "interaction design", "accessibility", "workshop facilitation"]],
  ["Staff Product Designer", "Design", "Full-time", ["design strategy", "systems thinking", "mentoring", "Figma"]],
  ["Design Systems Designer", "Design", "Full-time", ["design tokens", "component libraries", "documentation", "Figma"]],
  ["UX Researcher", "Research", "Full-time", ["interviewing", "survey design", "synthesis", "usability testing"]],
  ["Content Designer", "Design", "Full-time", ["UX writing", "information architecture", "content strategy"]],
  ["Design Intern", "Design", "Internship", ["Figma", "curiosity", "portfolio"]],
  ["Frontend Engineer", "Engineering", "Full-time", ["TypeScript", "React", "accessibility", "testing"]],
  ["Senior Frontend Engineer", "Engineering", "Full-time", ["TypeScript", "React", "performance", "design systems"]],
  ["Senior Backend Engineer", "Engineering", "Full-time", ["Java", "Spring", "MySQL", "distributed systems"]],
  ["Full Stack Engineer", "Engineering", "Full-time", ["TypeScript", "Node.js", "PostgreSQL", "AWS"]],
  ["Platform Engineer", "Engineering", "Full-time", ["Kubernetes", "Terraform", "observability", "AWS"]],
  ["iOS Engineer", "Engineering", "Full-time", ["Swift", "SwiftUI", "testing"]],
  ["Machine Learning Engineer", "Data", "Full-time", ["Python", "PyTorch", "MLOps", "SQL"]],
  ["Data Analyst", "Data", "Full-time", ["SQL", "dashboards", "experimentation", "storytelling"]],
  ["Product Manager", "Product", "Full-time", ["roadmapping", "discovery", "analytics", "stakeholder management"]],
  ["Senior Product Manager", "Product", "Full-time", ["strategy", "metrics", "leading without authority"]],
  ["Technical Writer", "Documentation", "Contract", ["API docs", "Markdown", "editing"]],
  ["Customer Success Manager", "Customer", "Full-time", ["onboarding", "renewals", "empathy", "CRM"]],
  ["Support Engineer", "Customer", "Part-time", ["debugging", "SQL", "written communication"]],
];
const COMPANIES = ["Lumen Health", "Northwind Labs", "Brightpath Learning", "Cobalt Payments", "Fernhill Mobility", "Atlas Commerce", "Juniper Cloud", "Meridian Software", "Pinecone Robotics", "Tidal Analytics", "Sparrow Finance", "Oakline Logistics", "Copperleaf Studio", "Vantage Care", "Nimbus Data", "Ridgeline Energy", "Marlowe Games", "Fable and Fern"];
const CITIES = ["Austin, TX", "Denver, CO", "New York, NY", "Seattle, WA", "Chicago, IL", "Boston, MA", "San Francisco, CA", "London, UK", "Toronto, Canada"];
const WORKPLACE = ["REMOTE", "HYBRID", "ONSITE", "REMOTE", "HYBRID"];
const PLATFORMS = ["greenhouse", "lever", "ashby"];

const description = (company, [title, dept, , skills], location, workplace) => {
  const where = workplace === "REMOTE" ? "fully remote within the US" : `based in ${location}${workplace === "HYBRID" ? " (hybrid, three days in the office)" : " (on-site)"}`;
  return [
    "About the role",
    `${company} is hiring a ${title} for our ${dept} team. This role is ${where}. You will work with a small, friendly group that ships every week and cares about the people who use what we build.`,
    "",
    "What you will do",
    "- Own a slice of the product from first idea to launch and the follow-up after it.",
    `- Work closely with teammates in ${dept === "Engineering" ? "design and product" : "engineering and product"} and write down what you learn.`,
    "- Raise the bar for quality and keep the team's tools and documents tidy.",
    "",
    "What you bring",
    `- Experience with ${skills.join(", ")}.`,
    "- Clear writing and a habit of asking good questions.",
    `- Curiosity about ${company}'s customers.`,
    "",
    "Benefits",
    "Health, dental and vision cover, a learning budget, flexible hours and paid parental leave. This is a demo posting made up for Kiwiply's sample account; it is not a real job.",
  ].join("\n");
};

/** 60 fictional postings spread over about six days. */
function buildPostings(now) {
  const rows = [];
  const seen = new Set();
  for (let i = 0; rows.length < 60; i++) {
    const role = ROLES[i % ROLES.length];
    const company = COMPANIES[(i * 7 + Math.floor(i / ROLES.length)) % COMPANIES.length];
    const workplace = WORKPLACE[(i * 3 + Math.floor(i / ROLES.length)) % WORKPLACE.length];
    const location = workplace === "REMOTE" ? "Remote (US)" : CITIES[(i * 5) % CITIES.length];
    const key = `${company}|${role[0]}|${location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = 500 + rows.length;
    rows.push({
      id,
      title: role[0],
      company,
      location,
      workplaceType: workplace,
      remote: workplace === "REMOTE",
      employmentType: role[2],
      department: role[1],
      platform: PLATFORMS[rows.length % PLATFORMS.length],
      url: `https://jobs.example.com/${company.toLowerCase().replace(/[^a-z]+/g, "-")}/${id}`,
      publishedAt: new Date(now - (3 + ((rows.length * 5) % 150)) * HOUR).toISOString(),
      descriptionText: description(company, role, location, workplace),
    });
    rows[rows.length - 1].applyUrl = `${rows[rows.length - 1].url}/apply`;
    rows[rows.length - 1].searchText = `${rows[rows.length - 1].title} ${company} ${location} ${rows[rows.length - 1].descriptionText}`.replace(/\s+/g, " ").toLowerCase();
  }
  return rows;
}

const normType = (raw) => {
  const e = String(raw ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (e.startsWith("fulltime") || e === "permanent") return "FULL_TIME";
  if (e.startsWith("parttime")) return "PART_TIME";
  if (e.startsWith("contract") || e.startsWith("freelance")) return "CONTRACT";
  if (e.startsWith("intern")) return "INTERNSHIP";
  return null;
};
const companyKey = (c) => String(c ?? "").trim().toLowerCase();
const wordsOf = (s) => String(s).toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];

/** The same grammar as `JobQueryParser`: words AND-ed (prefix), "phrases", -exclusions; short words by word start. */
function parseQuery(q) {
  const include = [];
  const exclude = [];
  for (const m of String(q ?? "").toLowerCase().matchAll(/(-?)"([^"]*)"|(-?)(\S+)/g)) {
    const quoted = m[2] !== undefined;
    const neg = (quoted ? m[1] : m[3]) === "-";
    const raw = quoted ? m[2] : m[4];
    const parts = wordsOf(raw);
    if (!parts.length) continue;
    const servable = parts.every((w) => w.length >= 3 && !STOP.has(w));
    const multi = quoted ? parts.length > 1 : false;
    const test = servable
      ? multi
        ? (t) => t.includes(parts.join(" "))
        : (t) => new RegExp(`(^|[^\\p{L}\\p{N}])${parts.join("[^\\p{L}\\p{N}]+")}`, "u").test(t)
      : (t) => t.startsWith(raw.replace(/^[^\p{L}\p{N}+#]+|[^\p{L}\p{N}+#]+$/gu, "")) || t.includes(` ${raw.replace(/^[^\p{L}\p{N}+#]+|[^\p{L}\p{N}+#]+$/gu, "")}`);
    (neg ? exclude : include).push({ text: parts.join(" "), raw: quoted ? parts.join(" ") : raw, quoted, test });
  }
  return { include, exclude };
}
const withoutLast = (q) => {
  const tokens = [...String(q ?? "").matchAll(/(-?)"([^"]*)"|(-?)(\S+)/g)].map((m) => ({ s: m[0], neg: (m[2] !== undefined ? m[1] : m[3]) === "-" }));
  let last = -1;
  tokens.forEach((t, i) => {
    if (!t.neg) last = i;
  });
  if (last < 0) return null;
  const rest = tokens.filter((_, i) => i !== last);
  return rest.some((t) => !t.neg) ? rest.map((t) => t.s).join(" ") : null;
};

export function createJobsMock({ json, withBody, subOf, APPLICATIONS, recordEvent = () => {}, isEmptyAccount = () => false }) {
  const POSTINGS = buildPostings(Date.now());
  const HIDDEN = new Map(); // sub -> { posts: Set<id>, companies: Set<key> }
  const hiddenOf = (sub) => {
    if (!HIDDEN.has(sub)) HIDDEN.set(sub, { posts: new Set(), companies: new Set() });
    return HIDDEN.get(sub);
  };
  const SAVED = new Map(); // sub -> Map<postingId, application> (accounts whose tracker is empty keep their own saves)

  const invalid = (res, path, message) => json(res, 422, { status: 422, code: "JOB_SEARCH_INVALID", title: "JOB_SEARCH_INVALID", path, message: `${path}: ${message}` });
  const notFound = (res) => json(res, 404, { status: 404, title: "Not Found" });
  const SUBMITTED = ["APPLIED", "IN_REVIEW", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"];

  /** The applications this account can see: the shared demo board, or (a brand-new account) only what it saved here. */
  const appsOf = (sub) => (isEmptyAccount(sub) ? [...(SAVED.get(sub)?.values() ?? [])] : APPLICATIONS);
  const tracked = (sub, p) => appsOf(sub).find((a) => a.postingId === p.id && !a.archived);
  const applied = (sub, p) => appsOf(sub).some((a) => a.postingId === p.id && SUBMITTED.includes(a.status));

  const card = (sub, p, extra = {}) => ({
    id: p.id,
    title: p.title,
    company: p.company,
    companyKey: companyKey(p.company),
    location: p.location,
    remote: p.workplaceType === "REMOTE",
    workplaceType: p.workplaceType,
    employmentType: normType(p.employmentType),
    publishedAt: p.publishedAt,
    source: { kind: "ATS", platform: p.platform, label: p.platform[0].toUpperCase() + p.platform.slice(1) },
    applyAts: p.platform,
    saved: Boolean(tracked(sub, p)),
    ...extra,
  });

  function filtersOf(q, res) {
    const loc = (q.get("loc") ?? "").trim();
    const company = (q.get("company") ?? "").trim();
    if (loc.length > SIZE.maxFilter) return invalid(res, "loc", `is longer than ${SIZE.maxFilter} characters`), null;
    if (company.length > SIZE.maxFilter) return invalid(res, "company", `is longer than ${SIZE.maxFilter} characters`), null;
    const remote = (q.get("remote") ?? "").trim().toUpperCase();
    if (remote && remote !== "ANY" && !["REMOTE", "HYBRID", "ONSITE"].includes(remote)) return invalid(res, "remote", "use ANY, REMOTE, HYBRID or ONSITE"), null;
    const types = [];
    for (const t of (q.get("type") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)) {
      if (!TYPES.includes(t)) return invalid(res, "type", `'${t}' is not one of ${TYPES.join(", ")}`), null;
      types.push(t);
    }
    let posted = null;
    if (q.get("posted")) {
      posted = Number(q.get("posted"));
      if (!POSTED.includes(posted)) return invalid(res, "posted", `use one of [${POSTED.join(", ")}]`), null;
    }
    return { loc: loc.toLowerCase(), company: company.toLowerCase(), remote: remote && remote !== "ANY" ? remote : null, types, posted };
  }

  const passes = (sub, p, f, parsed, skip = {}) => {
    const h = hiddenOf(sub);
    if (h.posts.has(p.id) || h.companies.has(companyKey(p.company)) || applied(sub, p)) return false;
    if (!parsed.include.every((t) => t.test(p.searchText)) || parsed.exclude.some((t) => t.test(p.searchText) || p.searchText.includes(t.text))) return false;
    if (f.loc && !p.location.toLowerCase().includes(f.loc)) return false;
    if (f.company && !p.company.toLowerCase().startsWith(f.company)) return false;
    if (!skip.remote && f.remote && p.workplaceType !== f.remote) return false;
    if (!skip.type && f.types.length && !f.types.includes(normType(p.employmentType))) return false;
    if (!skip.posted && f.posted && Date.parse(p.publishedAt) < Date.now() - f.posted * 24 * HOUR) return false;
    return true;
  };

  function search(sub, url, res) {
    const q = url.searchParams;
    const raw = (q.get("q") ?? "").trim();
    if (raw.length > SIZE.maxQuery) return json(res, 400, { status: 400, code: "QUERY_TOO_LONG", title: "QUERY_TOO_LONG", max: SIZE.maxQuery });
    const sort = (q.get("sort") ?? "best").split(",")[0].trim().toLowerCase();
    if (!["best", "newest"].includes(sort)) return json(res, 400, { status: 400, code: "SORT_INVALID", title: "SORT_INVALID", sort: q.get("sort"), allowed: ["best", "newest"] });
    const f = filtersOf(q, res);
    if (!f) return undefined;
    const size = Math.min(Number(q.get("size")) >= 1 ? Number(q.get("size")) : SIZE.default, SIZE.max);
    const page = Number(q.get("page")) >= 0 ? Math.floor(Number(q.get("page"))) : 0;
    const parsed = parseQuery(raw);
    const now = Date.now();

    const all = POSTINGS.filter((p) => passes(sub, p, f, parsed));
    const score = (p) => {
      const hoursOld = Math.max(0, (now - Date.parse(p.publishedAt)) / HOUR);
      const inTitle = parsed.include.length ? parsed.include.filter((t) => p.title.toLowerCase().includes(t.text)).length / parsed.include.length : 0.5;
      return 0.45 * inTitle + 0.2 * Math.exp(-hoursOld / 72) + 0.25 * 0.5;
    };
    const ordered = [...all].sort((a, b) => (sort === "newest" ? Date.parse(b.publishedAt) - Date.parse(a.publishedAt) : score(b) - score(a)) || b.id - a.id);
    const rows = ordered.slice(page * size, page * size + size);

    const count = (filters, qq = parsed) => POSTINGS.filter((p) => passes(sub, p, filters, qq)).length;
    const facetCount = (skip, key) => {
      const out = {};
      for (const p of POSTINGS.filter((x) => passes(sub, x, f, parsed, skip))) out[key(p)] = (out[key(p)] ?? 0) + 1;
      return out;
    };
    const remoteC = facetCount({ remote: true }, (p) => p.workplaceType);
    const typeC = facetCount({ type: true }, (p) => normType(p.employmentType));
    const facets = {
      remote: Object.fromEntries(["REMOTE", "HYBRID", "ONSITE"].map((k) => [k, remoteC[k] ?? 0])),
      type: Object.fromEntries(TYPES.map((k) => [k, typeC[k] ?? 0])),
      postedBuckets: Object.fromEntries(POSTED.map((d) => [String(d), POSTINGS.filter((p) => passes(sub, p, f, parsed, { posted: true }) && Date.parse(p.publishedAt) >= now - d * 24 * HOUR).length])),
    };

    const suggestions = [];
    if (all.length < SIZE.relaxBelow) {
      const base = {};
      if (raw) base.q = raw;
      if (f.loc) base.loc = q.get("loc").trim();
      if (f.remote) base.remote = f.remote;
      if (f.types.length) base.type = f.types.join(",");
      if (f.posted) base.posted = String(f.posted);
      if (f.company) base.company = q.get("company").trim();
      const tryOne = (label, key, newValue, relaxed, qq) => {
        const n = count(relaxed, qq);
        if (n <= all.length) return;
        const params = { ...base };
        if (newValue === null) delete params[key];
        else params[key] = newValue;
        suggestions.push({ label, params, total: n });
      };
      if (f.remote) tryOne("Any workplace", "remote", null, { ...f, remote: null });
      if (f.posted) {
        const wider = POSTED.find((d) => d > f.posted) ?? null;
        tryOne(wider ? `Posted in the last ${wider} days` : "Any date", "posted", wider ? String(wider) : null, { ...f, posted: wider });
      }
      const fewer = withoutLast(raw);
      if (fewer) {
        const n = count(f, parseQuery(fewer));
        if (n > all.length) suggestions.push({ label: `Search "${fewer}"`, params: { ...base, q: fewer }, total: n });
      }
      if (f.loc) tryOne("Any location", "loc", null, { ...f, loc: "" });
      if (f.types.length) tryOne("Any job type", "type", null, { ...f, types: [] });
      suggestions.sort((a, b) => b.total - a.total);
      suggestions.length = Math.min(suggestions.length, SIZE.relaxMax);
    }
    return json(res, 200, { items: rows.map((p) => card(sub, p)), total: all.length, page, size, capped: false, tookMs: 3, facets, suggestions });
  }

  function detail(sub, p, res) {
    const words = wordsOf(p.title).filter((w) => w.length >= 3 && !STOP.has(w) && !["senior", "staff"].includes(w));
    const similar = POSTINGS.filter((x) => x.id !== p.id && words.some((w) => x.title.toLowerCase().includes(w)) && !hiddenOf(sub).posts.has(x.id))
      .slice(0, SIZE.similarMax)
      .map((x) => card(sub, x));
    return json(res, 200, {
      card: card(sub, p),
      descriptionText: p.descriptionText,
      url: p.url,
      applyUrl: p.applyUrl,
      companyJobsCount: POSTINGS.filter((x) => companyKey(x.company) === companyKey(p.company) && x.id !== p.id).length,
      similar,
    });
  }

  function save(sub, p, res) {
    let a = tracked(sub, p);
    if (!a) {
      const id = Math.max(0, ...APPLICATIONS.map((x) => x.id), ...[...SAVED.values()].flatMap((m) => [...m.values()].map((x) => x.id))) + 1;
      const now = new Date().toISOString();
      a = {
        id, company: p.company, roleTitle: p.title, status: "SAVED", location: p.location, jobType: normType(p.employmentType), jobMode: p.workplaceType === "ONSITE" ? "ON_SITE" : p.workplaceType,
        atsPlatform: p.platform.toUpperCase(), jobUrl: p.url, createdAt: now, updatedAt: now, appliedAt: null, starred: false, archived: false, submissionConfirmed: false, resume: null, postingId: p.id, source: "search",
      };
      if (isEmptyAccount(sub)) {
        if (!SAVED.has(sub)) SAVED.set(sub, new Map());
        SAVED.get(sub).set(p.id, a);
      } else {
        APPLICATIONS.push(a);
        recordEvent(a, "CREATED", null, "SAVED", "WEB", null, "Added to your tracker");
      }
    }
    return json(res, 200, { applicationId: a.id });
  }

  return function handleJobs(req, res, path, method) {
    if (!path.startsWith("/api/jobs/")) return false;
    const m = path.match(/^\/api\/jobs\/(search|suggest|(\d+)(?:\/(save|feedback)(?:\/([A-Za-z_]+))?)?)$/);
    if (!m) return false;
    const [, head, idRaw, action, signalArg] = m;
    const known =
      (head === "search" && method === "GET") ||
      (head === "suggest" && method === "GET") ||
      (idRaw && !action && method === "GET") ||
      (idRaw && action === "save" && method === "POST") ||
      (idRaw && action === "feedback" && !signalArg && method === "POST") ||
      (idRaw && action === "feedback" && signalArg && method === "DELETE");
    if (!known) return false;
    const sub = subOf(req);
    if (!sub) {
      req.resume();
      return json(res, 401, { error: "Unauthorized" }), true;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const run = (b) => {
      if (head === "search") return search(sub, url, res);
      if (head === "suggest") {
        const t = (url.searchParams.get("q") ?? "").trim().toLowerCase();
        if (t.length < SIZE.suggestMin) return json(res, 200, []);
        const counts = new Map();
        for (const p of POSTINGS) {
          const lower = p.title.toLowerCase();
          if (lower.startsWith(t) || lower.includes(` ${t}`)) counts.set(p.title, (counts.get(p.title) ?? 0) + 1);
        }
        return json(res, 200, [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, SIZE.suggestMax).map(([title]) => title));
      }
      const p = POSTINGS.find((x) => x.id === Number(idRaw));
      if (!p) return notFound(res);
      if (!action) return detail(sub, p, res);
      if (action === "save") return save(sub, p, res);
      const h = hiddenOf(sub);
      if (method === "POST") {
        const s = String(b.signal ?? "").toUpperCase();
        if (s !== "HIDE" && s !== "HIDE_COMPANY") return invalid(res, "signal", "use HIDE or HIDE_COMPANY");
        (s === "HIDE" ? h.posts : h.companies).add(s === "HIDE" ? p.id : companyKey(p.company));
        let archivedApplicationId = null;
        for (const a of appsOf(sub).filter((x) => x.postingId === p.id && x.status === "SAVED" && !x.archived)) {
          a.archived = true;
          a.updatedAt = new Date().toISOString();
          if (!isEmptyAccount(sub)) recordEvent(a, "FIELD", null, null, "WEB", null, "Archived");
          archivedApplicationId ??= a.id;
        }
        return json(res, 201, { signal: s, archivedApplicationId });
      }
      const s = String(signalArg).toUpperCase();
      if (s === "HIDE") h.posts.delete(p.id);
      else h.companies.delete(companyKey(p.company));
      res.writeHead(204);
      return res.end();
    };
    if (method === "POST") withBody(req, run);
    else {
      req.resume();
      run({});
    }
    return true;
  };
}
