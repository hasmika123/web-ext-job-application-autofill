/**
 * Read/write-in-memory fixture for the Marketing Manager workspace.
 * It is used only by `npm run dev:demo`; the real API remains the source of truth.
 */

const DAY = 86_400_000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
const person = (id, name) => ({ id, name });
const member = (memberId, name) => ({ memberId, name });
const memberIdOf = (value) => value?.memberId ?? value?.id;

export function createMgmtMock({ json, withBody, hostOf }) {
  const respond = (res, status, body) => {
    json(res, status, body);
    return true;
  };
  const readBody = (req, callback) => {
    withBody(req, callback);
    return true;
  };
  const team = [
    { memberId: 103, name: "Sarah Chen", title: "Marketing Manager", status: "ACTIVE", capacity: 2, assigned: 1, percent: 50, overloaded: false, openApprovals: 0, openEscalations: 0, lastActiveAt: ago(0), canManage: true },
    { memberId: 104, name: "Mia Johnson", title: "Senior Marketing Specialist", status: "ACTIVE", capacity: 2, assigned: 1, percent: 50, overloaded: false, openApprovals: 2, openEscalations: 1, lastActiveAt: ago(0.2), canManage: true },
    { memberId: 105, name: "Omar Haddad", title: "Marketing Specialist", status: "PAUSED", capacity: 1, assigned: 1, percent: 100, overloaded: false, openApprovals: 1, openEscalations: 1, lastActiveAt: ago(3), canManage: true },
  ];
  const assignments = [
    { consultantId: 201, name: "Anika Rao", jobTitle: "Senior React Developer", email: null, availability: "AVAILABLE", marketer: member(104, "Mia Johnson"), backup: null, status: "ACTIVE", priority: "HIGH", activeApps: 3, lastActivityAt: ago(0.5), assignedAt: ago(30) },
    { consultantId: 202, name: "Ben Okafor", jobTitle: "DevOps Engineer", email: null, availability: "ON_PROJECT", marketer: member(103, "Sarah Chen"), backup: member(104, "Mia Johnson"), status: "ACTIVE", priority: "MEDIUM", activeApps: 2, lastActivityAt: ago(1), assignedAt: ago(22) },
    { consultantId: 203, name: "Emily Lawson", jobTitle: "Project Manager", email: null, availability: "AVAILABLE", marketer: member(105, "Omar Haddad"), backup: null, status: "PAUSED", priority: "LOW", activeApps: 1, lastActivityAt: ago(4), assignedAt: ago(45) },
    { consultantId: 204, name: "David Kim", jobTitle: "Data Engineer", email: null, availability: "AVAILABLE", marketer: null, backup: null, status: null, priority: null, activeApps: 0, lastActivityAt: null, assignedAt: null },
  ];
  const approvals = [
    { id: 501, kind: "OPPORTUNITY_ASSIGN", subjectType: "OPPORTUNITY", subjectId: 901, consultant: person(201, "Anika Rao"), requestedBy: person(104, "Mia Johnson"), requestedAt: ago(0.2), title: "Assign Anika Rao to Senior React Developer", note: "Strong React and TypeScript match.", status: "PENDING", decidedBy: null, decidedAt: null, decisionNote: null, expiresAt: ago(-5), payload: { opportunityId: 901 } },
    { id: 502, kind: "DUPLICATE_OVERRIDE", subjectType: "OPPORTUNITY", subjectId: 902, consultant: person(202, "Ben Okafor"), requestedBy: person(105, "Omar Haddad"), requestedAt: ago(1.3), title: "Override duplicate submission check", note: "Client asked to see the updated profile.", status: "PENDING", decidedBy: null, decidedAt: null, decisionNote: null, expiresAt: ago(-4), payload: { duplicateReason: "Client request" } },
    { id: 503, kind: "RESUME_RELEASE", subjectType: "RESUME", subjectId: 77, consultant: person(203, "Emily Lawson"), requestedBy: person(104, "Mia Johnson"), requestedAt: ago(8), title: "Release updated resume to Emily Lawson", note: "New certifications were added.", status: "APPROVED", decidedBy: person(103, "Sarah Chen"), decidedAt: ago(7), decisionNote: "Approved", expiresAt: ago(-20), payload: {}, },
  ];
  const escalations = [
    { id: 601, kind: "STALE_OPPORTUNITY", severity: "HIGH", subjectType: "OPPORTUNITY", subjectId: 901, consultant: person(201, "Anika Rao"), marketer: person(104, "Mia Johnson"), title: "Senior React Developer has gone quiet", detail: "No activity for 9 days while the opportunity is still open.", ruleKey: "OPPORTUNITY_STALLED", raisedBy: null, raisedAt: ago(2), status: "OPEN", assignee: null, snoozedUntil: null, resolvedBy: null, resolvedAt: null, resolution: null, ageHours: 48, events: [{ id: 1, kind: "RAISED", actor: null, note: "No activity for 9 days.", at: ago(2) }] },
    { id: 602, kind: "OVERDUE_FOLLOWUP", severity: "MEDIUM", subjectType: "CONSULTANT", subjectId: 202, consultant: person(202, "Ben Okafor"), marketer: person(103, "Sarah Chen"), title: "Ben Okafor needs a client follow-up", detail: "A follow-up task is overdue.", ruleKey: "FOLLOWUP_OVERDUE", raisedBy: null, raisedAt: ago(1), status: "ACKNOWLEDGED", assignee: person(103, "Sarah Chen"), snoozedUntil: null, resolvedBy: null, resolvedAt: null, resolution: null, ageHours: 24, events: [{ id: 2, kind: "RAISED", actor: null, note: null, at: ago(1) }, { id: 3, kind: "ACKNOWLEDGED", actor: person(103, "Sarah Chen"), note: "Reviewing with Mia.", at: ago(0.5) }] },
    { id: 603, kind: "STALE_OPPORTUNITY", severity: "LOW", subjectType: "OPPORTUNITY", subjectId: 903, consultant: person(203, "Emily Lawson"), marketer: person(105, "Omar Haddad"), title: "Project Manager opportunity snoozed", detail: "This escalation returns tomorrow.", ruleKey: "OPPORTUNITY_STALLED", raisedBy: null, raisedAt: ago(0.5), status: "SNOOZED", assignee: null, snoozedUntil: ago(-1), resolvedBy: null, resolvedAt: null, resolution: null, ageHours: 12, events: [] },
  ];

  const home = () => ({
    empty: false,
    generatedAt: new Date().toISOString(),
    tiles: { marketersActive: 2, marketersPaused: 1, consultantsCovered: 3, openOpportunities: 12, approvalsWaiting: approvals.filter((item) => item.status === "PENDING").length, escalations: { open: 2, high: 1, medium: 1, low: 0, snoozed: 1 } },
    pipeline: {
      assigned: { thisWeek: 8, lastWeek: 6, deltaPct: 33.3 },
      interested: { thisWeek: 5, lastWeek: 4, deltaPct: 25 },
      submitted: { thisWeek: 4, lastWeek: 5, deltaPct: -20 },
      interviews: { thisWeek: 2, lastWeek: 1, deltaPct: 100 },
    },
    workload: team.map(({ memberId, name, assigned, capacity, percent, overloaded }) => ({ memberId, name, assigned, capacity, percent, overloaded })),
    needsYou: [approvals[0], escalations[0]].map((item) => item.id === 501 ? { type: "APPROVAL", id: item.id, title: item.title, severity: null, who: item.requestedBy.name, since: item.requestedAt, link: `/w/marketing-mgmt/approvals?id=${item.id}` } : { type: "ESCALATION", id: item.id, title: item.title, severity: item.severity, who: item.marketer.name, since: item.raisedAt, link: `/w/marketing-mgmt/escalations?id=${item.id}` }),
    activity: [{ id: 1, type: "RESUME", text: "updated a resume", consultant: "Emily Lawson", actor: "Mia Johnson", at: ago(0.2) }, { id: 2, type: "OPPORTUNITY", text: "recorded consultant interest", consultant: "Ben Okafor", actor: "Sarah Chen", at: ago(0.6) }],
  });

  const teamMember = (memberId) => {
    const row = team.find((item) => item.memberId === memberId);
    if (!row) return null;
    return { row, consultants: assignments.filter((item) => memberIdOf(item.marketer) === memberId || memberIdOf(item.backup) === memberId).map((item) => ({ consultantId: item.consultantId, name: item.name, priority: item.priority ?? "", status: item.status ?? "", backup: memberIdOf(item.backup) === memberId })), weeks: [8, 7, 5, 6, 5, 6, 7, row.assigned].map((assigned, index) => ({ weekStart: `2026-11-${String(3 + index * 3).padStart(2, "0")}`, assigned, submitted: Math.max(0, assigned - 3), interviews: Math.max(0, Math.round(assigned / 4)) })), approvals: approvals.filter((item) => item.requestedBy?.id === memberId), escalations: escalations.filter((item) => memberIdOf(item.marketer) === memberId) };
  };

  const pipeline = () => {
    const cards = [
      { id: 901, consultantId: 201, consultant: "Anika Rao", requirementId: 11, job: "Senior React Developer", clientId: 31, client: "TechCorp", marketer: member(104, "Mia Johnson"), column: "ASSIGNED", priority: "HIGH", lastActivityAt: ago(9), ageDays: 12, stale: true },
      { id: 902, consultantId: 202, consultant: "Ben Okafor", requirementId: 12, job: "DevOps Engineer", clientId: 32, client: "HealthPlus", marketer: member(103, "Sarah Chen"), column: "INTERESTED", priority: "MEDIUM", lastActivityAt: ago(2), ageDays: 5, stale: false },
      { id: 903, consultantId: 203, consultant: "Emily Lawson", requirementId: 13, job: "Project Manager", clientId: 33, client: "InnovateLab", marketer: member(105, "Omar Haddad"), column: "INTERVIEW", priority: "LOW", lastActivityAt: ago(1), ageDays: 20, stale: false },
      { id: 904, consultantId: 204, consultant: "David Kim", requirementId: 14, job: "Data Engineer", clientId: 34, client: "FinTech Solutions", marketer: null, column: "NEEDS_INFO", priority: "MEDIUM", lastActivityAt: ago(3), ageDays: 7, stale: false },
    ];
    const columns = [{ key: "ASSIGNED", label: "Assigned" }, { key: "VIEWED", label: "Viewed" }, { key: "INTERESTED", label: "Interested" }, { key: "NEEDS_INFO", label: "Needs info" }, { key: "APPLIED", label: "Applied / Submitted" }, { key: "INTERVIEW", label: "Interview" }, { key: "OFFER", label: "Offer" }, { key: "CLOSED", label: "Closed" }];
    return { columns: columns.map((column) => ({ ...column, count: cards.filter((card) => card.column === column.key).length, items: cards.filter((card) => card.column === column.key) })), total: cards.length, page: 0, size: 50, staleDays: 7, rangeDays: 30, empty: false, generatedAt: new Date().toISOString() };
  };

  const reports = () => ({ orgId: 2, generatedAt: new Date().toISOString(), rangeDays: 30, tiles: [{ key: "consultants", label: "Consultants", value: 3, previous: 2, unit: "count" }, { key: "applications", label: "Applications", value: 18, previous: 14, unit: "count" }, { key: "interviews", label: "Interviews", value: 6, previous: 4, unit: "count" }, { key: "placements", label: "Active placements", value: 2, previous: 1, unit: "count" }, { key: "first-submission", label: "Time to first submission", value: 28, previous: null, unit: "hours" }], roster: { total: 3, byMarketingStatus: [{ key: "ACTIVE", label: "Active", count: 2 }, { key: "PAUSED", label: "Paused", count: 1 }], byAvailability: [{ key: "AVAILABLE", label: "Available", count: 2 }, { key: "ON_PROJECT", label: "On project", count: 1 }] }, funnel: { total: 18, thisWeek: 6, lastWeek: 4, deltaPct: 50, stages: [{ key: "APPLIED", label: "Applied", count: 9, enteredThisWeek: 3, enteredLastWeek: 2, deltaPct: 50 }, { key: "INTERVIEW", label: "Interview", count: 6, enteredThisWeek: 2, enteredLastWeek: 1, deltaPct: 100 }], weekly: [{ weekStart: "2026-11-03", value: 3, second: 0 }, { weekStart: "2026-11-10", value: 4, second: 0 }, { weekStart: "2026-11-17", value: 5, second: 0 }, { weekStart: "2026-11-24", value: 6, second: 0 }] }, interviews: { scheduled: 6, completed: 3, cancelled: 1, awaitingOutcome: 2, upcoming14Days: 3, weekly: [{ weekStart: "2026-11-03", value: 1, second: 1 }, { weekStart: "2026-11-10", value: 2, second: 1 }, { weekStart: "2026-11-17", value: 1, second: 0 }, { weekStart: "2026-11-24", value: 2, second: 1 }] }, placements: { active: 2, startedInRange: 1, endedInRange: 0, months: [{ month: "2026-09", started: 0, ended: 0 }, { month: "2026-10", started: 1, ended: 0 }, { month: "2026-11", started: 0, ended: 0 }] }, topClients: [{ name: "TechCorp", activePlacements: 1 }, { name: "HealthPlus", activePlacements: 1 }], marketers: team.map((member) => ({ memberId: member.memberId, name: member.name, consultants: member.assigned, openOpportunities: 4 })), firstSubmission: { medianHours: 28, sample: 7 } });

  return function handle(req, res, path, method) {
    if (hostOf(req) !== "acme.localhost") return false;
    const match = /^\/api\/orgs\/(\d+)\/mgmt(?:\/(.*))?$/.exec(path);
    if (!match || match[1] !== "2") return false;
    const rest = match[2] ?? "";
    const query = new URL(req.url ?? "/", "http://localhost").searchParams;
    if (method === "GET" && rest === "home") return respond(res, 200, home());
    if (method === "GET" && rest === "team") {
      const q = (query.get("q") ?? "").toLowerCase();
      const status = query.get("status") ?? "";
      const items = team.filter((row) => (!q || `${row.name} ${row.title}`.toLowerCase().includes(q)) && (!status || status === "ALL" || row.status === status));
      return respond(res, 200, { items, page: 0, size: 20, total: items.length, hasMore: false });
    }
    const teamMatch = /^team\/(\d+)$/.exec(rest);
    if (teamMatch && method === "GET") return teamMember(Number(teamMatch[1])) ? respond(res, 200, teamMember(Number(teamMatch[1]))) : respond(res, 404, { error: "Not found" });
    if (teamMatch && method === "PATCH") return readBody(req, (body) => { const row = team.find((item) => item.memberId === Number(teamMatch[1])); if (!row) return respond(res, 404, { error: "Not found" }); Object.assign(row, body); row.percent = row.capacity ? Math.round((row.assigned / row.capacity) * 100) : 0; return respond(res, 200, row); });
    if (method === "GET" && rest === "assignments") {
      const q = (query.get("q") ?? "").toLowerCase();
      const status = query.get("status") ?? "";
      const items = assignments.filter((row) => (!q || `${row.name} ${row.jobTitle ?? ""}`.toLowerCase().includes(q)) && (!status || row.status === status));
      return respond(res, 200, { items, page: 0, size: 50, total: items.length, hasMore: false });
    }
    const assignmentAction = /^assignments\/(assign|unassign|update|restore)$/.exec(rest);
    if (assignmentAction && method === "POST") return readBody(req, (body) => { const ids = Array.isArray(body.consultantIds) ? body.consultantIds : []; for (const consultantId of ids) { const row = assignments.find((item) => item.consultantId === consultantId); if (!row) continue; if (assignmentAction[1] === "unassign") row.marketer = null; if (assignmentAction[1] === "assign") { const targetMember = team.find((item) => item.memberId === Number(body.marketerMemberId)); if (targetMember) row.marketer = member(targetMember.memberId, targetMember.name); } } return respond(res, 200, { action: assignmentAction[1].toUpperCase(), requested: ids.length, ok: ids.length, skipped: [], results: ids.map((consultantId) => ({ consultantId, ok: true, reason: null, previous: {} })) }); });
    if (method === "GET" && rest === "workload") return respond(res, 200, { items: team.map((member) => ({ marketer: { memberId: member.memberId, name: member.name, title: member.title, status: member.status, capacity: member.capacity, assigned: member.assigned, percent: member.percent, overloaded: member.overloaded, highPriority: 2, paused: 0, withoutBackup: 1, activeApps: 3, backupFor: 1 }, series: [0, 1, 1, 2, 1, member.assigned - 1, member.assigned, member.assigned] })), summary: { marketers: team.length, totalAssigned: team.reduce((n, row) => n + row.assigned, 0), avgPerMarketer: 1, overloaded: 0, unassigned: 1 }, generatedAt: new Date().toISOString(), weekEnds: [] });
    if (method === "POST" && rest === "workload/rebalance") return readBody(req, () => respond(res, 200, { action: "REBALANCE", requested: 0, ok: 0, skipped: [], results: [] }));
    if (method === "GET" && rest === "pipeline") return respond(res, 200, pipeline());
    if (method === "GET" && rest === "pipeline/summary") { const board = pipeline(); return respond(res, 200, { columns: board.columns.map(({ key, label, count }) => ({ key, label, count })), stale: 1, staleDays: 7, rangeDays: Number(query.get("range") ?? 30), windows: [{ days: 30, steps: [{ key: "assigned", label: "Assigned", count: 8, conversionPct: null }, { key: "interested", label: "Interested", count: 5, conversionPct: 62.5 }, { key: "submitted", label: "Submitted", count: 4, conversionPct: 80 }] }], empty: false, generatedAt: new Date().toISOString() }); }
    if (method === "GET" && rest === "approvals") { const status = query.get("status") ?? "PENDING"; const items = status === "DECIDED" ? approvals.filter((item) => item.status !== "PENDING") : approvals.filter((item) => item.status === "PENDING"); return respond(res, 200, { items, page: 0, size: 20, total: items.length, hasMore: false }); }
    const approvalAction = /^approvals\/(\d+)\/(approve|reject)$/.exec(rest);
    if (approvalAction && method === "POST") return readBody(req, (body) => { const item = approvals.find((row) => row.id === Number(approvalAction[1])); if (!item) return respond(res, 404, { error: "Not found" }); item.status = approvalAction[2] === "approve" ? "APPROVED" : "REJECTED"; item.decidedBy = person(103, "Sarah Chen"); item.decidedAt = new Date().toISOString(); item.decisionNote = body.note ?? null; return respond(res, 200, item); });
    const approvalDetail = /^approvals\/(\d+)$/.exec(rest);
    if (approvalDetail && method === "GET") { const item = approvals.find((row) => row.id === Number(approvalDetail[1])); return item ? respond(res, 200, item) : respond(res, 404, { error: "Not found" }); }
    if (method === "GET" && rest === "escalations/counts") return respond(res, 200, { open: 2, high: 1, medium: 1, low: 0, snoozed: 1 });
    if (method === "GET" && rest === "escalations") { const status = query.get("status") ?? "OPEN"; const items = escalations.filter((item) => status === "OPEN" ? ["OPEN", "ACKNOWLEDGED"].includes(item.status) : item.status === status); return respond(res, 200, { items, page: 0, size: 20, total: items.length, hasMore: false }); }
    const escalationAction = /^escalations\/(\d+)\/(acknowledge|assign|snooze|resolve|dismiss|reopen|comment)$/.exec(rest);
    if (escalationAction && method === "POST") return readBody(req, (body) => { const item = escalations.find((row) => row.id === Number(escalationAction[1])); if (!item) return respond(res, 404, { error: "Not found" }); const action = escalationAction[2]; if (action === "acknowledge") item.status = "ACKNOWLEDGED"; if (action === "snooze") { item.status = "SNOOZED"; item.snoozedUntil = body.until; } if (action === "resolve") { item.status = "RESOLVED"; item.resolution = body.resolution; } if (action === "dismiss") item.status = "DISMISSED"; if (action === "reopen") item.status = "OPEN"; item.events.push({ id: item.events.length + 10, kind: action.toUpperCase(), actor: person(103, "Sarah Chen"), note: body.note ?? body.resolution ?? null, at: new Date().toISOString() }); return respond(res, 200, item); });
    const escalationDetail = /^escalations\/(\d+)$/.exec(rest);
    if (escalationDetail && method === "GET") { const item = escalations.find((row) => row.id === Number(escalationDetail[1])); return item ? respond(res, 200, item) : respond(res, 404, { error: "Not found" }); }
    if (method === "GET" && rest === "reports/overview") return respond(res, 200, reports());
    if (method === "GET" && rest === "reports/export") { res.writeHead(200, { "content-type": "text/csv;charset=UTF-8" }); res.end("Team reports\r\nConsultants,3\r\n"); return true; }
    return respond(res, 404, { error: "mock-api: no manager handler" });
  };
}
