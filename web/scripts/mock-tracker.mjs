/**
 * The applications tracker half of the local demo mock (DEV ONLY; APP-E2E U6.2 / U6.4). Imported by
 * `mock-api.mjs`, which hands it its own helpers. In memory and writable (like the builder), it speaks the
 * same contract as `ApplicationSyncResource` / `InterviewResource`:
 *
 *   GET    /api/profile/applications            plain array without query; with page|size|sort|q|status|company|
 *                                                archived|ghosted -> {items, total, page, size, summary}
 *   GET    /api/profile/applications/activity   [{day, count}] (dense, oldest first)
 *   GET    /api/profile/analytics               {range, granularity, real, stats, overTime, byStatus, inboxSeen, responseByCompany}
 *   GET    /api/profile/applications/:id        detail: events, notes, interviews, mailCount, suggestions
 *   PATCH  /api/profile/applications/:id        status | nextAction | nextActionAt | starred | archived | resumeId | outcome
 *   POST   /api/profile/applications/bulk       {ids, action, status?} -> {done, failed}
 *   POST/PUT/DELETE .../:id/notes[/:nid]
 *   POST/PUT/DELETE .../:id/interviews[/:iid], POST .../:iid/outcome
 *   GET    /api/profile/interviews?from&to&outcome, GET /api/profile/interviews/:id/ics
 *
 * Limits and refusals mirror the server defaults (page size 20 / max 50, bulk 50, note 4000 characters,
 * ghosted after 21 days, 422 TRACKER_INVALID / TRACKER_LIMIT / SENSITIVE_CONTENT, 400 SORT_INVALID, 404 for
 * an unknown id). PUT/DELETE on an application and every other write stay refused like the rest of the mock.
 */

const DAY = 86_400_000;
const SORTABLE = ["updatedAt", "createdAt", "appliedAt", "lastEventAt", "nextActionAt", "company", "roleTitle", "status"];
const STATUSES = ["DRAFT", "SAVED", "APPLIED", "IN_REVIEW", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"];
const KINDS = ["PHONE", "VIDEO", "ONSITE", "TECHNICAL", "BEHAVIORAL", "PANEL", "OTHER"];
const OUTCOMES = ["PENDING", "PASSED", "REJECTED", "NO_SHOW"];
const KIND_WORDS = { PHONE: "Phone interview", VIDEO: "Video interview", ONSITE: "Onsite interview", TECHNICAL: "Technical interview", BEHAVIORAL: "Behavioral interview", PANEL: "Panel interview", OTHER: "Interview" };
const LIMITS = { defaultSize: 20, maxSize: 50, bulk: 50, noteChars: 4000, notesPerApp: 200, interviewsPerApp: 30, ghostedDays: 21, activityDefault: 30, activityMax: 90, rangeDefault: 30, rangeMax: 366, maxHours: 24 };

export function createTrackerMock({ APPLICATIONS, json, withBody, subOf, ago, findSensitive, isEmpty = () => false }) {
  let nextEvent = 1;
  let nextNote = 1;
  let nextInterview = 1;
  const EVENTS = []; // {id, applicationId, kind, fromStatus, toStatus, source, refId, summary, createdAt}
  const NOTES = []; // {id, applicationId, body, pinned, createdAt, updatedAt}
  const INTERVIEWS = []; // {id, applicationId, kind, startsAt, endsAt, tz, location, interviewer, notes, outcome, source, createdAt, updatedAt}

  // The refusal helpers send the response and return `true`, so "validation said no" reads `if (bad === true)`.
  const problem = (res, status, code, extra = {}) => (json(res, status, { status, code, title: code, ...extra }), true);
  const invalid = (res, path, message) => problem(res, 422, "TRACKER_INVALID", { path, message: `${path}: ${message}` });
  const notFound = (res) => (json(res, 404, { status: 404, title: "Not Found" }), true);
  const iso = (d) => new Date(d).toISOString();
  const when = (a) => new Date(a).getTime();

  function record(a, kind, fromStatus, toStatus, source, refId, summary, at = new Date().toISOString()) {
    EVENTS.push({ id: nextEvent++, applicationId: a.id, kind, fromStatus: fromStatus ?? null, toStatus: toStatus ?? null, source, refId: refId ?? null, summary: String(summary ?? "").slice(0, 200), createdAt: at });
    if (!a.lastEventAt || when(at) > when(a.lastEventAt)) a.lastEventAt = at;
  }
  const words = (s) => ({ DRAFT: "Draft", SAVED: "Saved", APPLIED: "Applied", IN_REVIEW: "In review", INTERVIEW: "Interview", OFFER: "Offer", REJECTED: "Rejected", WITHDRAWN: "Withdrawn" })[s] ?? s;

  // ---- seed: a believable history for the demo applications ------------------------------------------------
  for (const a of APPLICATIONS) {
    a.updatedAt ??= a.createdAt;
    record(a, "CREATED", null, a.status === "SAVED" ? "SAVED" : "DRAFT", "SYSTEM", null, "Added to your tracker", a.createdAt);
    if (a.appliedAt) record(a, "STATUS", "DRAFT", "APPLIED", "EXTENSION", null, "Applied", a.appliedAt);
    if (["INTERVIEW", "OFFER", "REJECTED"].includes(a.status) && a.appliedAt) {
      record(a, "STATUS", "APPLIED", a.status, "INBOX", null, `Moved to ${words(a.status)} - from an email`, new Date(when(a.appliedAt) + 2 * DAY).toISOString());
    }
    a.lastEventAt ??= a.updatedAt;
  }
  const byId = (id) => APPLICATIONS.find((a) => a.id === Number(id));
  const seedInterview = (a, kind, daysFromNow, minutes, outcome, interviewer, location) => {
    const startsAt = new Date(Date.now() + daysFromNow * DAY);
    startsAt.setMinutes(0, 0, 0);
    const i = { id: nextInterview++, applicationId: a.id, kind, startsAt: iso(startsAt), endsAt: iso(when(startsAt) + minutes * 60_000), tz: "America/New_York", location, interviewer, notes: null, outcome, source: "WEB", createdAt: ago(Math.max(-daysFromNow + 3, 1)), updatedAt: ago(1) };
    INTERVIEWS.push(i);
    record(a, "INTERVIEW", null, null, "SYSTEM", i.id, `Interview scheduled: ${KIND_WORDS[kind]}`, ago(Math.max(-daysFromNow + 3, 1)));
  };
  const stripe = byId(1);
  const linear = byId(4);
  if (stripe) {
    seedInterview(stripe, "PHONE", -9, 30, "PASSED", "Maya Ortiz (recruiter)", "Phone");
    seedInterview(stripe, "VIDEO", 2, 60, "PENDING", "Sam Rivera", "https://meet.example.com/stripe-design");
    NOTES.push({ id: nextNote++, applicationId: 1, body: "Prep the payments redesign story; ask about the design systems team.", pinned: true, createdAt: ago(2), updatedAt: ago(2) });
    record(stripe, "NOTE", null, null, "SYSTEM", 1, "Note added", ago(2));
  }
  if (linear) {
    seedInterview(linear, "ONSITE", -7, 180, "PASSED", "Design team panel", "Linear HQ");
    NOTES.push({ id: nextNote++, applicationId: 4, body: "Offer call went well. Ask about the review at six months.", pinned: false, createdAt: ago(3), updatedAt: ago(3) });
    record(linear, "NOTE", null, null, "SYSTEM", 2, "Note added", ago(3));
  }

  // ---- derived fields ----------------------------------------------------------------------------------------
  const isGhosted = (a) =>
    !a.archived && (a.status === "APPLIED" || a.status === "IN_REVIEW") && when(a.lastEventAt ?? a.updatedAt) < Date.now() - LIMITS.ghostedDays * DAY;
  const upcoming = (a) => INTERVIEWS.filter((i) => i.applicationId === a.id && when(i.startsAt) >= Date.now()).sort((x, y) => when(x.startsAt) - when(y.startsAt))[0];
  function nextStep(a) {
    const n = upcoming(a);
    if (n) return { label: KIND_WORDS[n.kind], at: n.startsAt };
    if (a.status === "OFFER") return { label: "Review offer", at: null };
    if (a.nextAction) return { label: a.nextAction, at: a.nextActionAt ?? null };
    return null;
  }
  function enrich(a) {
    const out = { ...a, ghosted: isGhosted(a), interviewsCount: INTERVIEWS.filter((i) => i.applicationId === a.id).length, notesCount: NOTES.filter((n) => n.applicationId === a.id).length, mailCount: 0 };
    const step = nextStep(a);
    if (step) out.nextStep = step;
    return out;
  }
  const interviewDto = (i) => {
    const a = byId(i.applicationId);
    return { ...i, company: a?.company ?? null, roleTitle: a?.roleTitle ?? null };
  };

  // ---- list ------------------------------------------------------------------------------------------------------
  function list(res, url, empty = false) {
    const q = url.searchParams;
    const v2 = ["page", "size", "sort", "q", "status", "company", "archived", "ghosted"].some((k) => q.has(k));
    if (!v2) return json(res, 200, empty ? [] : [...APPLICATIONS].sort((a, b) => when(b.updatedAt) - when(a.updatedAt)));

    const statuses = new Set();
    for (const t of (q.get("status") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)) {
      if (!STATUSES.includes(t)) return invalid(res, "status", `'${t}' is not a status`);
      statuses.add(t);
    }
    const archived = (q.get("archived") ?? "false").toLowerCase();
    if (!["true", "false", "all"].includes(archived)) return invalid(res, "archived", "use true, false or all");
    const rawText = (q.get("q") ?? "").trim();
    if (rawText.length > 120) return problem(res, 400, "QUERY_TOO_LONG", { max: 120 });
    const text = rawText.toLowerCase();
    const company = (q.get("company") ?? "").trim().toLowerCase();

    let field = "updatedAt";
    let dir = "desc";
    if (q.get("sort")) {
      const parts = q.get("sort").split(",");
      field = parts[0].trim();
      dir = (parts[1] ?? "asc").trim().toLowerCase();
      if (!SORTABLE.includes(field) || parts.length > 2 || !["asc", "desc"].includes(dir)) return problem(res, 400, "SORT_INVALID", { sort: q.get("sort"), allowed: SORTABLE });
    }
    const size = Math.min(Number(q.get("size")) >= 1 ? Number(q.get("size")) : LIMITS.defaultSize, LIMITS.maxSize);
    const page = Number(q.get("page")) >= 0 ? Math.floor(Number(q.get("page"))) : 0;

    const matches = (a) => (!text || [a.company, a.roleTitle, a.location].some((f) => String(f ?? "").toLowerCase().includes(text))) && (!company || a.company.toLowerCase() === company);
    const base = (empty ? [] : APPLICATIONS).filter(matches);
    const live = base.filter((a) => !a.archived);
    const summary = Object.fromEntries(["ALL", ...STATUSES, "GHOSTED", "ARCHIVED"].map((k) => [k, 0]));
    summary.ALL = live.length;
    for (const a of live) summary[a.status] += 1;
    summary.GHOSTED = live.filter(isGhosted).length;
    summary.ARCHIVED = base.filter((a) => a.archived).length;

    let rows = base.filter((a) => (archived === "all" ? true : archived === "true" ? a.archived : !a.archived));
    if (statuses.size) rows = rows.filter((a) => statuses.has(a.status));
    if (q.get("ghosted") === "true") rows = rows.filter(isGhosted);
    const key = (a) => (["company", "roleTitle", "status"].includes(field) ? String(a[field] ?? "").toLowerCase() : when(a[field] ?? 0));
    rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * (dir === "asc" ? 1 : -1) || b.id - a.id);
    return json(res, 200, { items: rows.slice(page * size, page * size + size).map(enrich), total: rows.length, page, size, summary });
  }

  function activity(res, url, empty = false) {
    let days = Number(url.searchParams.get("days"));
    days = Number.isFinite(days) && days >= 1 ? Math.min(Math.floor(days), LIMITS.activityMax) : LIMITS.activityDefault;
    const tz = url.searchParams.get("tz") || "UTC";
    let fmt;
    try {
      fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      return invalid(res, "tz", "not a time zone name (use an IANA name like America/New_York)");
    }
    const counts = new Map();
    for (let d = days - 1; d >= 0; d--) counts.set(fmt.format(new Date(Date.now() - d * DAY)), 0);
    for (const e of empty ? [] : EVENTS) {
      const day = fmt.format(new Date(e.createdAt));
      if (counts.has(day)) counts.set(day, counts.get(day) + 1);
    }
    return json(res, 200, [...counts].map(([day, count]) => ({ day, count })));
  }

  // ---- analytics (U12.1): the same "first became X" rule as ProfileAnalyticsService ---------------------------------------
  const APPLIED_OR_LATER = ["APPLIED", "IN_REVIEW", "INTERVIEW", "OFFER", "REJECTED"];
  const REPLIED = ["IN_REVIEW", "INTERVIEW", "OFFER", "REJECTED"];
  const firstAt = (a, stages) => {
    const ts = EVENTS.filter((e) => e.applicationId === a.id && stages.includes(e.toStatus)).map((e) => when(e.createdAt));
    if (ts.length) return Math.min(...ts);
    return stages.includes(a.status) ? when(a.appliedAt ?? a.updatedAt ?? a.createdAt) : null;
  };

  function analytics(res, url, empty = false) {
    const q = url.searchParams;
    const rawRange = q.get("range") === null ? 30 : Number(q.get("range"));
    const range = Math.max(7, Math.min(Number.isFinite(rawRange) ? Math.floor(rawRange) : 30, 365));
    const tz = q.get("tz") || "UTC";
    let dayOf;
    try {
      const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
      dayOf = (t) => fmt.format(new Date(t));
    } catch {
      return invalid(res, "tz", "not a time zone name (use an IANA name like America/New_York)");
    }
    const monthly = range > 180;
    const now = Date.now();
    const from = Date.parse(`${dayOf(now - (range - 1) * DAY)}T00:00:00Z`); // day starts, close enough for the mock
    const prevFrom = from - range * DAY;
    const live = (empty ? [] : APPLICATIONS).filter((a) => !a.archived);
    const reached = live.map((a) => ({ a, applied: firstAt(a, APPLIED_OR_LATER), replied: firstAt(a, REPLIED), interviewed: firstAt(a, ["INTERVIEW", "OFFER"]), offered: firstAt(a, ["OFFER"]) }));
    const inW = (t) => t !== null && t >= from && t <= now;
    const real = reached.some((r) => r.applied !== null);
    const cohort = reached.filter((r) => inW(r.applied));
    const bucketKey = (t) => {
      const d = new Date(`${dayOf(t)}T00:00:00Z`);
      if (monthly) d.setUTCDate(1);
      else d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    };
    const buckets = new Map();
    for (let t = Date.parse(`${bucketKey(from)}T00:00:00Z`); t <= now; ) {
      const start = new Date(t).toISOString().slice(0, 10);
      buckets.set(start, { start, applied: 0, interviews: 0, offers: 0 });
      const d = new Date(t);
      if (monthly) d.setUTCMonth(d.getUTCMonth() + 1);
      else d.setUTCDate(d.getUTCDate() + 7);
      t = d.getTime();
    }
    for (const r of reached) {
      for (const [k, slot] of [["applied", "applied"], ["interviewed", "interviews"], ["offered", "offers"]]) if (inW(r[k])) buckets.get(bucketKey(r[k]))[slot] += 1;
    }
    const byStatus = STATUSES.map((s) => ({ status: s, label: words(s), count: live.filter((a) => a.status === s && when(a.lastEventAt ?? a.updatedAt ?? a.createdAt) >= from).length })).filter((s) => s.count > 0);
    const inboxSeen = EVENTS.some((e) => e.source === "INBOX" && e.toStatus && live.some((a) => a.id === e.applicationId));
    const perCompany = new Map();
    if (inboxSeen) {
      for (const r of cohort) {
        const c = perCompany.get(r.a.company.toLowerCase()) ?? { company: r.a.company, applied: 0, replied: 0 };
        c.applied += 1;
        if (r.replied !== null) c.replied += 1;
        perCompany.set(r.a.company.toLowerCase(), c);
      }
    }
    return json(res, 200, {
      range,
      granularity: monthly ? "month" : "week",
      real,
      stats: {
        applied: cohort.length,
        appliedPrev: reached.filter((r) => r.applied !== null && r.applied >= prevFrom && r.applied < from).length,
        replies: reached.filter((r) => inW(r.replied)).length,
        interviews: reached.filter((r) => inW(r.interviewed)).length,
        offers: reached.filter((r) => inW(r.offered)).length,
        responseRate: cohort.length ? Math.round((100 * cohort.filter((r) => r.replied !== null).length) / cohort.length) : null,
      },
      overTime: [...buckets.values()],
      byStatus,
      inboxSeen,
      responseByCompany: [...perCompany.values()].sort((x, y) => y.applied - x.applied || y.replied - x.replied || x.company.localeCompare(y.company)).slice(0, 5),
    });
  }

  // ---- detail, patch, bulk -----------------------------------------------------------------------------------------
  function detail(res, a) {
    const events = EVENTS.filter((e) => e.applicationId === a.id).sort((x, y) => when(y.createdAt) - when(x.createdAt) || y.id - x.id).slice(0, 50);
    const notes = NOTES.filter((n) => n.applicationId === a.id).sort((x, y) => Number(y.pinned) - Number(x.pinned) || when(y.createdAt) - when(x.createdAt));
    const interviews = INTERVIEWS.filter((i) => i.applicationId === a.id).sort((x, y) => when(x.startsAt) - when(y.startsAt)).map(interviewDto);
    return json(res, 200, { ...enrich(a), events, notes, interviews, suggestions: [] });
  }

  /** Applies a patch to `a`; returns an error string to refuse (already sent) or null. */
  function applyPatch(res, a, b) {
    const now = new Date().toISOString();
    if ("status" in b) {
      const to = typeof b.status === "string" ? b.status.trim().toUpperCase() : null;
      if (!to || !STATUSES.includes(to)) return invalid(res, "status", "must be a status name");
      const from = a.status;
      a.status = to;
      if (["APPLIED", "IN_REVIEW", "INTERVIEW", "OFFER"].includes(to)) {
        a.appliedAt ??= now;
        a.submissionConfirmed = true;
      }
      if (to !== from) record(a, "STATUS", from, to, "WEB", null, `Moved to ${words(to)}`);
    }
    if ("nextAction" in b) {
      if (b.nextAction !== null && typeof b.nextAction !== "string") return invalid(res, "nextAction", "must be text");
      const v = (b.nextAction ?? "").trim() || null;
      if (v && v.length > 160) return invalid(res, "nextAction", "is longer than 160 characters");
      if (v && findSensitive(v, "nextAction")) return problem(res, 422, "SENSITIVE_CONTENT", { path: "nextAction", class: "SSN_ITIN" });
      if (v !== (a.nextAction ?? null)) {
        a.nextAction = v;
        record(a, "FIELD", null, null, "WEB", null, v ? `Next step: ${v}` : "Next step cleared");
      }
    }
    if ("nextActionAt" in b) {
      if (b.nextActionAt !== null && Number.isNaN(Date.parse(b.nextActionAt))) return invalid(res, "nextActionAt", "must be an ISO-8601 date-time like 2026-10-14T09:00:00Z");
      a.nextActionAt = b.nextActionAt === null ? null : iso(b.nextActionAt);
    }
    if ("starred" in b) {
      if (typeof b.starred !== "boolean") return invalid(res, "starred", "must be true or false");
      a.starred = b.starred;
    }
    if ("archived" in b) {
      if (typeof b.archived !== "boolean") return invalid(res, "archived", "must be true or false");
      if (b.archived !== Boolean(a.archived)) record(a, "FIELD", null, null, "WEB", null, b.archived ? "Archived" : "Restored from archive");
      a.archived = b.archived;
    }
    if ("resumeId" in b) {
      if (b.resumeId === null) a.resume = null;
      else if (Number.isInteger(b.resumeId)) a.resume = { id: b.resumeId, label: "Priya Sharma - Product Designer" };
      else return invalid(res, "resumeId", "must be a resume id or null");
    }
    if ("outcome" in b) {
      const o = b.outcome === null ? null : typeof b.outcome === "string" ? b.outcome.trim().toUpperCase() : "?";
      if (o !== null && !["ACCEPTED", "DECLINED"].includes(o)) return invalid(res, "outcome", "use ACCEPTED, DECLINED or null");
      if (o !== (a.outcome ?? null)) {
        a.outcome = o;
        a.acceptedAt = o === "ACCEPTED" ? now : null;
        record(a, "FIELD", null, null, "WEB", null, o === null ? "Offer reopened" : o === "ACCEPTED" ? "Accepted the offer" : "Declined the offer");
      }
    }
    a.updatedAt = now;
    return null;
  }

  function bulk(res, b) {
    const ids = Array.isArray(b.ids) ? [...new Set(b.ids.filter((x) => x !== null))] : [];
    if (!ids.length) return invalid(res, "ids", "name at least one application");
    if (ids.length > LIMITS.bulk) return problem(res, 422, "TRACKER_LIMIT", { limit: LIMITS.bulk, message: `A bulk action takes at most ${LIMITS.bulk} applications` });
    const action = String(b.action ?? "").toUpperCase();
    const patches = { ARCHIVE: { archived: true }, UNARCHIVE: { archived: false }, STAR: { starred: true }, UNSTAR: { starred: false } };
    let patch = patches[action];
    if (action === "STATUS") {
      if (!b.status) return invalid(res, "status", "a STATUS action needs a status");
      if (!STATUSES.includes(String(b.status).toUpperCase())) return invalid(res, "status", "must be a status name");
      patch = { status: b.status };
    }
    if (!patch) return invalid(res, "action", "use ARCHIVE, UNARCHIVE, STATUS, STAR or UNSTAR");
    const done = [];
    const failed = [];
    for (const id of ids) {
      const a = byId(id);
      if (!a) failed.push({ id, reason: "NOT_FOUND" });
      else {
        applyPatch({ writeHead() {}, end() {} }, a, patch);
        done.push(id);
      }
    }
    return json(res, 200, { done, failed });
  }

  // ---- notes ---------------------------------------------------------------------------------------------------------
  function noteText(res, v) {
    if (typeof v !== "string" || !v.trim()) return invalid(res, "body", "write something");
    if (v.length > LIMITS.noteChars) return invalid(res, "body", `is longer than ${LIMITS.noteChars} characters`);
    if (findSensitive(v, "body")) return problem(res, 422, "SENSITIVE_CONTENT", { path: "body", class: "SSN_ITIN" });
    return null;
  }

  // ---- interviews ----------------------------------------------------------------------------------------------------
  function interviewFields(res, i, b, creating) {
    if (creating || "kind" in b) {
      const k = typeof b.kind === "string" ? b.kind.trim().toUpperCase() : "";
      if (!KINDS.includes(k)) return invalid(res, "kind", creating && b.kind == null ? "is required" : `use one of ${KINDS.join(", ")}`);
      i.kind = k;
    }
    if (creating || "startsAt" in b) {
      if (typeof b.startsAt !== "string" || Number.isNaN(Date.parse(b.startsAt))) return invalid(res, "startsAt", b.startsAt == null ? "is required" : "must be an ISO-8601 date-time like 2026-10-10T14:00:00Z");
      i.startsAt = iso(b.startsAt);
    }
    if ("endsAt" in b) {
      if (b.endsAt !== null && Number.isNaN(Date.parse(b.endsAt))) return invalid(res, "endsAt", "must be an ISO-8601 date-time like 2026-10-10T14:00:00Z");
      i.endsAt = b.endsAt === null ? null : iso(b.endsAt);
    }
    if ("tz" in b) {
      const tz = (b.tz ?? "").trim() || null;
      if (tz) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: tz });
        } catch {
          return invalid(res, "tz", "is not a time zone name (use an IANA name like America/New_York)");
        }
      }
      i.tz = tz;
    }
    for (const [f, max] of [["location", 200], ["interviewer", 120], ["notes", 4000]]) {
      if (!(f in b)) continue;
      const v = (b[f] ?? "").toString().trim() || null;
      if (v && v.length > max) return invalid(res, f, `is longer than ${max} characters`);
      if (v && findSensitive(v, f)) return problem(res, 422, "SENSITIVE_CONTENT", { path: f, class: "SSN_ITIN" });
      i[f] = v;
    }
    if (i.endsAt) {
      if (when(i.endsAt) <= when(i.startsAt)) return invalid(res, "endsAt", "must be after startsAt");
      if (when(i.endsAt) - when(i.startsAt) > LIMITS.maxHours * 3_600_000) return invalid(res, "endsAt", `an interview is at most ${LIMITS.maxHours} hours long`);
    }
    return null;
  }

  function range(res, url, empty = false) {
    const q = url.searchParams;
    const bound = (s, end) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T00:00:00Z`) + (end ? DAY : 0);
      const t = Date.parse(s);
      return Number.isNaN(t) ? null : t;
    };
    const from = q.get("from") ? bound(q.get("from"), false) : Date.now();
    const to = q.get("to") ? bound(q.get("to"), true) : from === null ? null : from + LIMITS.rangeDefault * DAY;
    if (from === null) return invalid(res, "from", "must be a date (yyyy-MM-dd) or an ISO-8601 date-time");
    if (to === null) return invalid(res, "to", "must be a date (yyyy-MM-dd) or an ISO-8601 date-time");
    if (to <= from) return invalid(res, "to", "must be after from");
    if (to - from > LIMITS.rangeMax * DAY) return invalid(res, "to", `the range is at most ${LIMITS.rangeMax} days`);
    const outcome = q.get("outcome") ? q.get("outcome").toUpperCase() : null;
    if (outcome && !OUTCOMES.includes(outcome)) return invalid(res, "outcome", "use PENDING, PASSED, REJECTED or NO_SHOW");
    const rows = (empty ? [] : INTERVIEWS).filter((i) => when(i.startsAt) >= from && when(i.startsAt) < to && (!outcome || i.outcome === outcome)).sort((a, b) => when(a.startsAt) - when(b.startsAt) || a.id - b.id);
    return json(res, 200, rows.map(interviewDto));
  }

  /** A minimal calendar file (UTC times; the real API also writes a VTIMEZONE for the interview's zone). */
  function ics(i) {
    const a = byId(i.applicationId);
    const stamp = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const end = i.endsAt ?? iso(when(i.startsAt) + 3_600_000);
    const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kiwiply//Dossier Interviews//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
      `UID:interview-${i.id}@kiwiply.com`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(i.startsAt)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(`Interview: ${a?.roleTitle ?? ""} at ${a?.company ?? ""}`)}`, ...(i.location ? [`LOCATION:${esc(i.location)}`] : []),
      `DESCRIPTION:${esc(`${KIND_WORDS[i.kind]}\nFrom your Kiwiply tracker.`)}`, "STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR", "",
    ].join("\r\n");
  }

  // ---- the router ------------------------------------------------------------------------------------------------------
  /** Handles the tracker endpoints; returns true when the request was answered. */
  const handleTracker = function handleTracker(req, res, path, method) {
    if (path === "/api/profile/analytics" && method === "GET") {
      req.resume();
      if (!subOf(req)) return json(res, 401, { error: "Unauthorized" }), true;
      analytics(res, new URL(req.url ?? "/", "http://localhost"), isEmpty(req));
      return true;
    }
    const feed = path.match(/^\/api\/profile\/interviews(?:\/(\d+)\/ics)?$/); // the cross-application interview list / .ics
    const m = feed ? null : path.match(/^\/api\/profile\/applications(?:\/(activity|bulk|\d+)(?:\/(notes|interviews)(?:\/(\d+)(?:\/(outcome))?)?)?)?$/);
    if (!feed && !m) return false;
    const isInterviewFeed = Boolean(feed);
    const [, arg, sub, subId, action] = m ?? [];
    const known =
      isInterviewFeed
        ? method === "GET"
        : (path === "/api/profile/applications" && method === "GET") ||
          (arg === "activity" && method === "GET") ||
          (arg === "bulk" && method === "POST") ||
          (/^\d+$/.test(arg ?? "") && !sub && (method === "GET" || method === "PATCH")) ||
          (sub === "notes" && (subId ? ["PUT", "DELETE"] : ["POST"]).includes(method)) ||
          (sub === "interviews" && (subId ? (action ? method === "POST" : ["PUT", "DELETE"].includes(method)) : method === "POST"));
    if (!known) return false; // everything else is refused like any other mock write (or 404s)

    const url = new URL(req.url ?? "/", "http://localhost");
    const respond = (fn) => {
      if (!subOf(req)) {
        req.resume();
        return json(res, 401, { error: "Unauthorized" });
      }
      if (method === "GET" || method === "DELETE") {
        req.resume();
        return fn({});
      }
      return withBody(req, (b) => (b && typeof b === "object" && !Array.isArray(b) ? fn(b) : json(res, 400, { status: 400, title: "Bad Request" })));
    };

    respond((b) => {
      // ---- the cross-application interview feed
      if (isInterviewFeed) {
        if (!feed[1]) return range(res, url, isEmpty(req));
        const i = INTERVIEWS.find((x) => x.id === Number(feed[1]));
        if (!i) return notFound(res);
        res.writeHead(200, { "content-type": "text/calendar;charset=UTF-8", "content-disposition": `attachment; filename="interview-${i.id}.ics"` });
        return res.end(ics(i));
      }
      // ---- applications
      if (path === "/api/profile/applications") return list(res, url, isEmpty(req));
      if (arg === "activity") return activity(res, url, isEmpty(req));
      if (arg === "bulk") return bulk(res, b);
      const a = isEmpty(req) ? null : byId(arg); // a brand-new account owns no application
      if (!a) return notFound(res);
      if (!sub) {
        if (method === "GET") return detail(res, a);
        if (applyPatch(res, a, b) === true) return undefined; // refused: the response is already sent
        return json(res, 200, enrich(a));
      }
      if (sub === "notes") {
        if (!subId) {
          const bad = noteText(res, b.body);
          if (bad !== null) return bad;
          if (NOTES.filter((n) => n.applicationId === a.id).length >= LIMITS.notesPerApp) return problem(res, 422, "TRACKER_LIMIT", { limit: LIMITS.notesPerApp });
          const n = { id: nextNote++, applicationId: a.id, body: b.body, pinned: b.pinned === true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          NOTES.push(n);
          record(a, "NOTE", null, null, "WEB", n.id, "Note added");
          return json(res, 201, n);
        }
        const n = NOTES.find((x) => x.id === Number(subId) && x.applicationId === a.id);
        if (!n) return notFound(res);
        if (method === "DELETE") {
          NOTES.splice(NOTES.indexOf(n), 1);
          res.writeHead(204);
          return res.end();
        }
        if ("body" in b) {
          const bad = noteText(res, b.body);
          if (bad !== null) return bad;
          n.body = b.body;
        }
        if ("pinned" in b) {
          if (typeof b.pinned !== "boolean") return invalid(res, "pinned", "must be true or false");
          n.pinned = b.pinned;
        }
        n.updatedAt = new Date().toISOString();
        return json(res, 200, n);
      }
      // ---- interviews of one application
      if (!subId) {
        if (INTERVIEWS.filter((i) => i.applicationId === a.id).length >= LIMITS.interviewsPerApp) return problem(res, 422, "TRACKER_LIMIT", { limit: LIMITS.interviewsPerApp });
        const i = { id: nextInterview, applicationId: a.id, kind: "OTHER", startsAt: "", endsAt: null, tz: null, location: null, interviewer: null, notes: null, outcome: "PENDING", source: "WEB", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const bad = interviewFields(res, i, b, true);
        if (bad !== null) return bad;
        i.id = nextInterview++;
        INTERVIEWS.push(i);
        record(a, "INTERVIEW", null, null, "WEB", i.id, `Interview scheduled: ${KIND_WORDS[i.kind]}`);
        return json(res, 201, interviewDto(i));
      }
      const i = INTERVIEWS.find((x) => x.id === Number(subId) && x.applicationId === a.id);
      if (!i) return notFound(res);
      if (action === "outcome") {
        const o = typeof b.outcome === "string" ? b.outcome.trim().toUpperCase() : "";
        if (!OUTCOMES.includes(o)) return invalid(res, "outcome", b.outcome == null ? "is required" : "use PENDING, PASSED, REJECTED or NO_SHOW");
        if (o !== i.outcome) {
          i.outcome = o;
          i.updatedAt = new Date().toISOString();
          record(a, "INTERVIEW", null, null, "WEB", i.id, `Interview outcome: ${{ PASSED: "Passed", REJECTED: "Rejected", NO_SHOW: "No show", PENDING: "Pending" }[o]}`);
        }
        return json(res, 200, interviewDto(i));
      }
      if (method === "DELETE") {
        INTERVIEWS.splice(INTERVIEWS.indexOf(i), 1);
        record(a, "INTERVIEW", null, null, "WEB", null, `Interview removed: ${KIND_WORDS[i.kind]}`);
        res.writeHead(204);
        return res.end();
      }
      const before = i.startsAt;
      const bad = interviewFields(res, i, b, false);
      if (bad !== null) return bad;
      i.updatedAt = new Date().toISOString();
      if (i.startsAt !== before) record(a, "INTERVIEW", null, null, "WEB", i.id, `Interview rescheduled: ${KIND_WORDS[i.kind]}`);
      return json(res, 200, interviewDto(i));
    });
    return true;
  };
  /** Lets the other mocks (job search saving a job) write into the same timeline. */
  handleTracker.record = record;
  return handleTracker;
}
