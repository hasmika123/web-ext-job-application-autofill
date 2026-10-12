/**
 * The organization half of the local demo mock (DEV ONLY; APP-E2E O2.2 / O6.2 / O2.3 / O5.1 / O13.1). Imported by
 * `mock-api.mjs`, which hands it its own helpers. In memory and WRITABLE (like the builder and the tracker), it speaks the
 * same contract as the Spring resources it stands in for:
 *
 *   public  GET  /api/join/:token                       JoinResource: the preview of an emailed invite
 *           GET  /api/join/code/:code                   the preview of a shared join link
 *   signed in
 *           POST /api/join/:token/accept                accept: becomes a member, records the consent choice
 *           POST /api/join/code/:code                   the same for a shared link
 *           GET  /api/me/orgs                           MeOrgResource: my organizations and what each can see
 *           PUT  /api/me/orgs/:orgId/share              change what I share (NONE | SUMMARY; FULL needs a named marketer)
 *           POST /api/me/orgs/:orgId/leave              leave (an owner must transfer first)
 *           POST /api/orgs/:orgId/members/invite        OrgMemberResource: invite by email (the link goes to the outbox)
 *           POST /api/orgs/:orgId/members/:id/resend    rotate the link and send it again
 *   dev only
 *           GET  /mock/org/outbox?to=<email>            the "emails" the mock "sent": [{to, link, ...}], newest first
 *           POST /mock/org/reset                        put both organizations back as seeded (a journey starts clean)
 *           POST /mock/org/fill-code?code=<CODE>        use one place of a join code (to walk it to "no places left")
 *
 * Refusals mirror the server: ONE generic 404 for anything that is not a live link or not the caller's, 409
 * ALREADY_MEMBER / INVITE_EXPIRED / SEAT_STATE, 422 ORG_INVALID / ORG_LIMIT_REACHED / SENSITIVE_CONTENT, and 403
 * DEMO_READ_ONLY for the shared demo accounts' writes. Limits are the server defaults (200 per call, 1000 per day,
 * 14 days, 3 re-sends a week). Two organizations are seeded: Demo Bootcamp (the real seed's twin, owned by `demo-org`,
 * `demo` is a member) and Brightside Bootcamp, a writable one owned by the fixture account `org.owner` with nobody else
 * in it yet, so a journey can invite a first person and watch them arrive.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const DAY = 86_400_000;
const LIMITS = { perBatch: 200, perDay: 1000, expiryDays: 14, resendsPerWeek: 3, codeUsesMax: 10_000 };
export const CONSENT_VERSION = "org-share/v1";

/** The visibility matrix, in ShareField order (docLabel, least open scope that shows it). */
const MATRIX = [
  ["SEAT", "Seat", "NONE"],
  ["ACTIVATED", "Activated", "NONE"],
  ["STAGE_COUNTS", "Counts per stage", "SUMMARY"],
  ["LAST_ACTIVITY", "Last activity date", "SUMMARY"],
  ["RESUME_READINESS", "Resume readiness", "SUMMARY"],
  ["UPCOMING_INTERVIEW_COUNT", "Interview count upcoming", "SUMMARY"],
  ["PLACEMENT", "Placement", "SUMMARY"],
  ["EMPLOYER_DETAILS", "Employer names", "FULL"],
  ["APPLICATION_DETAIL", "Application detail", "FULL"],
  ["RESUMES", "Resumes", "FULL"],
  ["INTERVIEW_CALENDAR", "Interview calendar entries", "FULL"],
  ["JOB_ASSIGNMENTS", "Job assignments", "FULL"],
  ["PRIVATE_DATA", "Answers cache", null],
];
const RANK = { NONE: 0, SUMMARY: 1, FULL: 2 };
const WORDS = {
  SEAT: "That you are a member: your name, email, role and group",
  ACTIVATED: "Whether you have started using Kiwiply",
  STAGE_COUNTS: "How many applications you have in each stage",
  LAST_ACTIVITY: "The day you were last active",
  RESUME_READINESS: "Whether you have a resume and how strong it looks",
  UPCOMING_INTERVIEW_COUNT: "How many interviews you have coming up, as a number",
  PLACEMENT: "Whether you told us you were placed, and when",
  EMPLOYER_DETAILS: "Company names, job titles, locations and salaries",
  APPLICATION_DETAIL: "Your applications in detail",
  RESUMES: "Your resumes",
  INTERVIEW_CALENDAR: "Your interview calendar",
  JOB_ASSIGNMENTS: "Jobs assigned to you",
};
const NEVER = ["Your saved answers", "AI drafts", "Your inbox", "Private notes", "Sign-in details"];

/** The consent text the server ships (api/src/main/resources/consent/org-share/v1.md); a short copy when it cannot be read. */
function consentText() {
  try {
    return readFileSync(new URL("../../api/src/main/resources/consent/org-share/v1.md", import.meta.url), "utf8");
  } catch {
    return "# What your organization can see\n\nYou choose. Change it any time in Settings.";
  }
}

const ROLE_ORDER = ["OWNER", "ADMIN", "STAFF", "MEMBER", "MARKETER", "FINANCE"];
const EMAIL = /^[^@\s<>,;"']+@[^@\s<>,;"']+\.[^@\s<>,;"']+$/;

export function createOrgMock({ json, withBody, subOf, ACCOUNTS, FIXTURE_ACCOUNTS, DEMO_ORG, ORGS_ENABLED, findSensitive }) {
  let nextOrgId = 1;
  let nextSeatId = 1;
  let nextBatchId = 1;
  const ORGS = new Map(); // id -> org
  const TOKENS = new Map(); // sha256(token) -> seat (INVITED)
  const CODES = new Map(); // CODE -> { orgId, groupId, maxUses, uses, expiresAt, revokedAt }
  const OUTBOX = []; // {to, name, link, orgName, role, at}

  const notFound = (res) => json(res, 404, { status: 404, code: "NOT_FOUND", title: "Not Found", message: "error.org" });
  const problem = (res, status, code, extra = {}) => json(res, status, { status, code, title: code, message: "error.org", ...extra });
  const invalid = (res, field, message) => problem(res, 422, "ORG_INVALID", { field, message, title: `${field}: ${message}` });
  const limit = (res, name, max) => problem(res, 422, "ORG_LIMIT_REACHED", { limit: name, max, title: `The limit of ${max} (${name}) has been reached` });
  const isDemo = (sub) => !!ACCOUNTS[sub] && !FIXTURE_ACCOUNTS[sub];
  const demoRefused = (res) => json(res, 403, { code: "DEMO_READ_ONLY", message: "This is a demo account - changes aren't saved" });
  const hash = (t) => createHash("sha256").update(t).digest("hex");
  const token = () => randomBytes(24).toString("base64url").replace(/[-_]/g, "x").slice(0, 32).padEnd(32, "x");
  const nameOf = (login) => {
    const a = ACCOUNTS[login];
    return a ? `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() : "";
  };
  const defaultSettings = () => ({ defaultRole: "MEMBER", defaultShareScope: "SUMMARY", allowSelfLeave: true, digestDay: "DAILY", digestTime: "08:00", quietHours: { start: "21:00", end: "08:00" }, showPayToConsultant: false });

  const seat = (org, over) => {
    const s = { id: nextSeatId++, orgId: org.id, login: null, inviteEmail: null, inviteName: null, role: "MEMBER", status: "ACTIVE", groupId: null, supportOwnerId: null, invitedBy: null, joinedAt: new Date().toISOString(), invitedAt: null, expiresAt: null, tokenHash: null, sentAt: null, resendCount: 0, resendWindowAt: null, scope: "NONE", consentVersion: CONSENT_VERSION, scopeChangedAt: null, ...over };
    org.seats.push(s);
    return s;
  };

  function seedAll() {
    ORGS.clear();
    TOKENS.clear();
    CODES.clear();
    OUTBOX.length = 0;
    nextOrgId = 1;
    nextSeatId = 1;
    seedDemoOrg();
    seedBrightside();
  }

  // ---- seed: the demo organization, as DemoOrgSeeder makes it --------------------------------------------------------
  function seedDemoOrg() {
    const o = { id: nextOrgId++, slug: DEMO_ORG.org.slug, name: DEMO_ORG.org.name, type: DEMO_ORG.org.type, status: DEMO_ORG.org.status, website: null, sizeBand: DEMO_ORG.org.sizeBand, country: DEMO_ORG.org.country, timezone: DEMO_ORG.org.timezone, billingEmail: null, settings: defaultSettings(), hasLogo: false, createdAt: new Date(Date.now() - 30 * DAY).toISOString(), groups: [], seats: [] };
    ORGS.set(o.id, o);
    for (const g of DEMO_ORG.groups) o.groups.push({ id: g.id, name: g.name, kind: g.kind, sortOrder: g.sortOrder });
    const gid = (name) => o.groups.find((g) => g.name === name)?.id ?? null;
    seat(o, { login: DEMO_ORG.owner, role: "OWNER", scope: "NONE" });
    for (const p of DEMO_ORG.people) {
      const real = !!ACCOUNTS[p.login];
      seat(o, {
        login: real ? p.login : null,
        synthetic: p,
        inviteEmail: `${p.login}@example.com`,
        inviteName: `${p.first} ${p.last}`,
        role: p.role,
        status: p.status,
        groupId: gid(p.group),
        scope: p.scope,
        joinedAt: p.status === "ACTIVE" ? new Date(Date.now() - 20 * DAY).toISOString() : null,
        invitedAt: new Date(Date.now() - 25 * DAY).toISOString(),
      });
    }
    seat(o, { login: DEMO_ORG.jobSeeker.login, role: "MEMBER", groupId: gid(DEMO_ORG.jobSeeker.group), scope: DEMO_ORG.jobSeeker.scope, joinedAt: new Date(Date.now() - 18 * DAY).toISOString() });
  }

  // ---- seed: Brightside Bootcamp, owned by the fixture account `org.owner`, nobody else in it yet ------------------------
  function seedBrightside() {
    const owner = Object.values(FIXTURE_ACCOUNTS).find((a) => a.orgOwner);
    if (!owner) return;
    const o = { id: nextOrgId++, slug: "brightside-bootcamp", name: "Brightside Bootcamp", type: "BOOTCAMP", status: "ACTIVE", website: null, sizeBand: "51_200", country: "US", timezone: "America/Chicago", billingEmail: null, settings: defaultSettings(), hasLogo: false, createdAt: ago(2), groups: [{ id: 1, name: "Spring cohort", kind: "COHORT", sortOrder: 0 }], seats: [] };
    ORGS.set(o.id, o);
    seat(o, { login: owner.login, role: "OWNER", scope: "NONE" });
    CODES.set("BRTE5K26", { orgId: o.id, groupId: 1, maxUses: 3, uses: 0, expiresAt: new Date(Date.now() + 30 * DAY).toISOString(), revokedAt: null });
  }

  function ago(d) {
    return new Date(Date.now() - d * DAY).toISOString();
  }

  seedAll();

  // ---- helpers over the store ---------------------------------------------------------------------------------------------
  const live = (s) => s.status === "INVITED" || s.status === "ACTIVE" || s.status === "SUSPENDED";
  const mySeat = (org, sub) => org.seats.find((s) => s.login === sub && s.status === "ACTIVE") ?? null;
  const liveSeatOf = (org, sub) => org.seats.find((s) => s.login === sub && (s.status === "ACTIVE" || s.status === "SUSPENDED")) ?? null;
  const seatable = (org, role) => org.status === "ACTIVE" || org.status === "PAST_DUE" || ((org.status === "DRAFT" || org.status === "PENDING_SETUP_FEE") && role === "ADMIN");
  const inviterName = (org, s) => {
    const by = s.invitedBy ? org.seats.find((x) => x.id === s.invitedBy) : null;
    return by?.login ? nameOf(by.login) || null : null;
  };
  const groupName = (org, id) => (id ? (org.groups.find((g) => g.id === id)?.name ?? null) : null);
  const consent = (org) => ({
    version: CONSENT_VERSION,
    defaultScope: org.settings.defaultShareScope === "NONE" ? "NONE" : "SUMMARY",
    options: ["SUMMARY", "NONE"],
    matrix: MATRIX.map(([field, label, minScope]) => ({ field, label, minScope })),
    text: consentText(),
  });
  const previewOf = (org, source, role, groupId, expiresAt, inviter) => ({
    source,
    orgName: org.name,
    orgSlug: org.slug,
    role,
    inviterName: inviter,
    groupName: groupName(org, groupId),
    pays: [],
    expiresAt,
    open: seatable(org, role),
    consent: consent(org),
  });

  const seesAt = (scope) => MATRIX.filter(([f, , min]) => min !== null && RANK[scope] >= RANK[min] && WORDS[f]).map(([f]) => WORDS[f]);
  function myOrgView(org, s) {
    const effective = s.status === "ACTIVE" && (org.status === "ACTIVE" || org.status === "PAST_DUE") ? s.scope : "NONE";
    return {
      org: { id: org.id, slug: org.slug, name: org.name, status: org.status },
      memberId: s.id,
      role: s.role,
      status: s.status,
      scope: s.scope,
      effectiveScope: effective,
      consentVersion: s.consentVersion,
      fullTo: null,
      since: s.joinedAt,
      scopeChangedAt: s.scopeChangedAt,
      sees: seesAt(s.scope),
      neverSees: NEVER,
      canLeave: s.status === "ACTIVE" && s.role !== "OWNER" && (s.role !== "MEMBER" || org.settings.allowSelfLeave),
      canChangeScope: s.status === "ACTIVE",
    };
  }

  /** The token seat for an emailed invite, with the generic 404 for anything that is not a live invite. */
  function inviteSeat(tok) {
    if (!/^[A-Za-z0-9]{32}$/.test(tok)) return null;
    for (const org of ORGS.values()) {
      const s = org.seats.find((x) => x.tokenHash === hash(tok));
      if (s) return { org, seat: s };
    }
    return null;
  }

  function sendInvite(org, s, role) {
    const tok = token();
    s.tokenHash = hash(tok);
    s.expiresAt = new Date(Date.now() + LIMITS.expiryDays * DAY).toISOString();
    s.sentAt = new Date().toISOString();
    OUTBOX.unshift({ to: s.inviteEmail, name: s.inviteName, orgName: org.name, role, link: `/join/t/${tok}`, expiresAt: s.expiresAt, at: s.sentAt });
  }

  // ---- the handler -------------------------------------------------------------------------------------------------------
  return function handleOrg(req, res, path, method) {
    if (path === "/mock/org/reset" && method === "POST") {
      req.resume();
      seedAll();
      json(res, 200, { reset: true });
      return true;
    }
    if (path === "/mock/org/fill-code" && method === "POST") {
      req.resume();
      const c = CODES.get(new URL(req.url, "http://x").searchParams.get("code") ?? "");
      if (!c) return json(res, 404, { error: "no such code" }), true;
      c.uses = Math.min((c.maxUses ?? LIMITS.codeUsesMax), c.uses + 1);
      return json(res, 200, { uses: c.uses, maxUses: c.maxUses }), true;
    }
    if (path === "/mock/org/outbox" && method === "GET") {
      const to = new URL(req.url, "http://x").searchParams.get("to");
      json(res, 200, OUTBOX.filter((m) => !to || m.to === to.toLowerCase()));
      return true;
    }
    const joinPath = path.startsWith("/api/join/");
    const mePath = path === "/api/me/orgs" || path.startsWith("/api/me/orgs/");
    const orgPath = /^\/api\/orgs\/\d+\/members\/(invite|\d+\/resend)$/.test(path);
    if (!joinPath && !mePath && !orgPath) return false;
    if (!ORGS_ENABLED) {
      req.resume();
      notFound(res);
      return true;
    }

    // -- public previews ---------------------------------------------------------------------------------------------------
    if (joinPath && method === "GET") {
      req.resume();
      const code = /^\/api\/join\/code\/([^/]+)$/.exec(path);
      if (code) {
        const key = code[1].toUpperCase().replace(/[-\s]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
        const c = CODES.get(key);
        const org = c ? ORGS.get(c.orgId) : null;
        if (!c || c.revokedAt || !org || org.status === "CLOSED") return notFound(res), true;
        if (new Date(c.expiresAt) < new Date()) return problem(res, 409, "INVITE_EXPIRED", { reason: "expired", orgName: org.name }), true;
        if (c.maxUses != null && c.uses >= c.maxUses) return problem(res, 409, "INVITE_EXPIRED", { reason: "full", orgName: org.name }), true;
        return json(res, 200, previewOf(org, "CODE", "MEMBER", c.groupId, c.expiresAt, null)), true;
      }
      const t = /^\/api\/join\/([^/]+)$/.exec(path);
      if (t) {
        const hit = inviteSeat(t[1]);
        if (!hit || hit.seat.status !== "INVITED" || hit.org.status === "CLOSED") return notFound(res), true;
        if (new Date(hit.seat.expiresAt) < new Date()) return problem(res, 409, "INVITE_EXPIRED", { reason: "expired", orgName: hit.org.name }), true;
        return json(res, 200, previewOf(hit.org, "EMAIL", hit.seat.role, hit.seat.groupId, hit.seat.expiresAt, inviterName(hit.org, hit.seat))), true;
      }
      return notFound(res), true;
    }

    // -- everything else needs a signed-in account --------------------------------------------------------------------------
    const sub = subOf(req);
    if (!sub) {
      req.resume();
      json(res, 401, { error: "Unauthorized" });
      return true;
    }

    if (mePath && method === "GET") {
      req.resume();
      const out = [];
      for (const org of ORGS.values()) {
        const s = liveSeatOf(org, sub);
        if (s && s.role !== "COACH") out.push(myOrgView(org, s));
      }
      out.sort((a, b) => a.org.name.localeCompare(b.org.name));
      json(res, 200, out);
      return true;
    }

    if (isDemo(sub) && method !== "GET") {
      req.resume();
      demoRefused(res);
      return true;
    }

    // -- accept an invite or a code ---------------------------------------------------------------------------------------------
    const acceptTok = /^\/api\/join\/([^/]+)\/accept$/.exec(path);
    const acceptCode = /^\/api\/join\/code\/([^/]+)$/.exec(path);
    if (method === "POST" && (acceptTok || acceptCode)) {
      return withBody(req, (b) => {
        if (!["NONE", "SUMMARY", "FULL"].includes(b.shareScope)) return invalid(res, "shareScope", "is required");
        if (b.shareScope === "FULL") return invalid(res, "shareScope", "can be NONE or SUMMARY when joining");
        if (b.consentVersion !== CONSENT_VERSION) return invalid(res, "consentVersion", "must be the consent text version you were shown");
        let org;
        let s;
        let code = null;
        if (acceptTok) {
          const hit = inviteSeat(acceptTok[1]);
          if (!hit) return notFound(res);
          org = hit.org;
          s = hit.seat;
          if (s.status === "ACTIVE" && s.login === sub) return problem(res, 409, "ALREADY_MEMBER", { title: "You are already a member of this organization" });
          if (s.status !== "INVITED" || org.status === "CLOSED") return notFound(res);
          if (new Date(s.expiresAt) < new Date()) return problem(res, 409, "INVITE_EXPIRED", { reason: "expired", orgName: org.name });
        } else {
          const key = acceptCode[1].toUpperCase().replace(/[-\s]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
          code = CODES.get(key);
          org = code ? ORGS.get(code.orgId) : null;
          if (!code || code.revokedAt || !org || org.status === "CLOSED") return notFound(res);
          if (liveSeatOf(org, sub)) return problem(res, 409, "ALREADY_MEMBER", { title: "You are already a member of this organization" });
          if (new Date(code.expiresAt) < new Date()) return problem(res, 409, "INVITE_EXPIRED", { reason: "expired", orgName: org.name });
          if (code.maxUses != null && code.uses >= code.maxUses) return problem(res, 409, "INVITE_EXPIRED", { reason: "full", orgName: org.name });
        }
        const role = s ? s.role : "MEMBER";
        if (!seatable(org, role)) return problem(res, 409, "SEAT_STATE", { orgStatus: org.status, title: "This organization cannot add that kind of person right now" });
        if (liveSeatOf(org, sub)) return problem(res, 409, "ALREADY_MEMBER", { title: "You are already a member of this organization" });
        if (code) {
          code.uses += 1;
          s = seat(org, { role: "MEMBER", status: "ACTIVE", groupId: code.groupId });
        }
        s.login = sub;
        s.status = "ACTIVE";
        s.joinedAt = new Date().toISOString();
        s.scope = b.shareScope;
        s.consentVersion = b.consentVersion;
        s.scopeChangedAt = s.joinedAt;
        json(res, 200, { orgId: org.id, orgSlug: org.slug, orgName: org.name, memberId: s.id, role: s.role, shareScope: s.scope, pays: [] });
      }), true;
    }

    // -- the member's side ----------------------------------------------------------------------------------------------------------
    const share = /^\/api\/me\/orgs\/(\d+)\/share$/.exec(path);
    const leave = /^\/api\/me\/orgs\/(\d+)\/leave$/.exec(path);
    if ((share && method === "PUT") || (leave && method === "POST")) {
      const org = ORGS.get(Number((share ?? leave)[1]));
      const s = org ? mySeat(org, sub) : null;
      if (!s) {
        req.resume();
        return notFound(res), true;
      }
      if (leave) {
        req.resume();
        if (s.role === "OWNER") return problem(res, 409, "OWNER_MUST_TRANSFER", { title: "Transfer ownership before leaving" }), true;
        if (s.role === "MEMBER" && !org.settings.allowSelfLeave) return problem(res, 409, "LEAVE_NOT_ALLOWED", { title: "This organization does not let members leave on their own" }), true;
        s.status = "LEFT";
        s.leftAt = new Date().toISOString();
        s.scope = "NONE";
        res.writeHead(204);
        res.end();
        return true;
      }
      return withBody(req, (b) => {
        if (!["NONE", "SUMMARY", "FULL"].includes(b.scope)) return invalid(res, "scope", "is required");
        if (b.consentVersion !== CONSENT_VERSION) return invalid(res, "consentVersion", "must be a consent text version that exists");
        if (b.scope === "FULL") return invalid(res, "fullToMemberId", "must be an active marketer in this organization");
        if (b.scope !== s.scope) {
          s.scope = b.scope;
          s.consentVersion = b.consentVersion;
          s.scopeChangedAt = new Date().toISOString();
        }
        json(res, 200, myOrgView(org, s));
      }), true;
    }

    // -- invite / resend (OrgMemberResource) ---------------------------------------------------------------------------------------
    const inv = /^\/api\/orgs\/(\d+)\/members\/invite$/.exec(path);
    const resend = /^\/api\/orgs\/(\d+)\/members\/(\d+)\/resend$/.exec(path);
    if (method === "POST" && (inv || resend)) {
      const org = ORGS.get(Number((inv ?? resend)[1]));
      const me = org ? mySeat(org, sub) : null;
      if (!me || !["OWNER", "ADMIN", "STAFF"].includes(me.role)) {
        req.resume();
        return notFound(res), true;
      }
      if (resend) {
        req.resume();
        const target = org.seats.find((x) => x.id === Number(resend[2]));
        if (!target || target.status !== "INVITED" || !target.inviteEmail) return notFound(res), true;
        const windowOpen = target.resendWindowAt && new Date(target.resendWindowAt) > new Date(Date.now() - 7 * DAY);
        const used = windowOpen ? target.resendCount : 0;
        if (used >= LIMITS.resendsPerWeek) return limit(res, "inviteResends", LIMITS.resendsPerWeek), true;
        target.resendCount = used + 1;
        if (!windowOpen) target.resendWindowAt = new Date().toISOString();
        sendInvite(org, target, target.role);
        return json(res, 200, { memberId: target.id, email: target.inviteEmail, name: target.inviteName, role: target.role, expiresAt: target.expiresAt }), true;
      }
      return withBody(req, (b) => {
        const emails = Array.isArray(b.emails) ? b.emails : [];
        if (!emails.length) return invalid(res, "emails", "must name at least one address");
        if (emails.length > LIMITS.perBatch) return limit(res, "inviteBatch", LIMITS.perBatch);
        const role = b.role ?? org.settings.defaultRole;
        if (role === "COACH") return problem(res, 422, "RESERVED_VALUE", { field: "role", title: "COACH is reserved and cannot be used yet" });
        if (role === "OWNER") return invalid(res, "role", "an owner cannot be invited; transfer ownership instead");
        if (me.role === "STAFF" && role !== "MEMBER") return invalid(res, "role", "you can invite members only");
        if (me.role === "ADMIN" && role === "ADMIN") return invalid(res, "role", "only an owner can invite another admin");
        if (!ROLE_ORDER.includes(role)) return invalid(res, "role", "is not a role");
        if (!seatable(org, role)) return problem(res, 409, "SEAT_STATE", { orgStatus: org.status, title: "This organization cannot add that kind of person right now" });
        const invalidRows = [];
        const fresh = [];
        const already = [];
        const seen = new Set();
        for (const raw of emails) {
          const shown = String(raw ?? "").trim();
          const named = /^(.*)<\s*([^<>]+?)\s*>\s*$/.exec(shown);
          const addr = (named ? named[2] : shown).trim().toLowerCase();
          const name = named ? named[1].trim().replace(/^"|"$/g, "") || null : null;
          if (addr.length > 254) invalidRows.push({ entry: shown.slice(0, 120), reason: "too_long" });
          else if (!EMAIL.test(addr)) invalidRows.push({ entry: shown.slice(0, 120), reason: "malformed" });
          else if (name && (name.length > 80 || findSensitive({ name }, "name"))) invalidRows.push({ entry: shown.slice(0, 120), reason: name.length > 80 ? "too_long" : "sensitive_name" });
          else if (seen.has(addr)) invalidRows.push({ entry: shown.slice(0, 120), reason: "duplicate" });
          else {
            seen.add(addr);
            if (org.seats.some((x) => live(x) && x.inviteEmail === addr) || org.seats.some((x) => live(x) && x.login && ACCOUNTS[x.login]?.email?.toLowerCase() === addr)) already.push(addr);
            else fresh.push({ addr, name });
          }
        }
        const sentToday = org.seats.filter((x) => x.sentAt && new Date(x.sentAt) > new Date(Date.now() - DAY)).length;
        if (sentToday + fresh.length > LIMITS.perDay) return limit(res, "inviteDaily", LIMITS.perDay);
        const invited = fresh.map((f) => {
          const s = seat(org, { role, status: "INVITED", inviteEmail: f.addr, inviteName: f.name, invitedBy: me.id, invitedAt: new Date().toISOString(), joinedAt: null, supportOwnerId: me.role === "STAFF" ? me.id : null });
          sendInvite(org, s, role);
          return { memberId: s.id, email: f.addr, name: f.name, role, expiresAt: s.expiresAt };
        });
        json(res, 200, { batchId: invited.length ? nextBatchId++ : null, invited, invalid: invalidRows, alreadyMember: already });
      }), true;
    }

    req.resume();
    return notFound(res), true;
  };
}

/** Exposed for the members / settings halves that live next to this one (same store). */
export const ORG_MOCK_LIMITS = LIMITS;
