/**
 * The Marketing Performance API mock (marketer workspace), in memory, DEV ONLY: `GET /api/orgs/{orgId}/mkt/performance` and
 * `PUT /api/orgs/{orgId}/mkt/performance/goals`. The rows are the approved "Performance" board, so the page can be compared to it side by side.
 * Only acme (id 2) members who hold the marketing grants see it; anyone else gets the API's 404. The card periods in the query change
 * only the labels/length here (the board has one set of numbers).
 */
const MEMBERS = new Set(["marketer@acme.com", "sarah@acme.com", "demo-ent-acme-omar", "demo-ent-acme-sarah"]);
const MIN = 60e3;
const H = 60 * MIN;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const WEEK_STARTS = ["2024-08-26", "2024-09-02", "2024-09-09", "2024-09-16", "2024-09-23", "2024-09-30", "2024-10-07", "2024-10-14"];
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
const SUBS = [44, 50, 58, 50, 64, 62, 64, 72];
const INTS = [20, 24, 26, 24, 26, 26, 24, 26];
const OFFS = [8, 12, 14, 12, 18, 18, 16, 20];
const TREND_DATES = ["2024-08-04", "2024-08-11", "2024-08-18", "2024-08-25", "2024-09-01", "2024-09-08", "2024-09-15", "2024-09-22", "2024-09-29", "2024-10-06", "2024-10-13", "2024-10-20"];
const TREND_S = [70, 78, 86, 94, 102, 110, 117, 124, 130, 135, 139, 142];
const TREND_I = [18, 22, 25, 28, 31, 34, 37, 40, 42, 44, 45, 46];
const TREND_O = [10, 12, 14, 16, 18, 20, 21, 22, 23, 24, 25, 26];

const targets = { submissions: 200, interviews: 60, offers: 40, placements: 15 };
const pct = (a, t) => (t > 0 ? Math.round((a * 100) / t) : null);

const goals = () => ({
  period: "month",
  canEdit: true,
  rows: [
    ["submissions", "Submissions", 142],
    ["interviews", "Interviews", 46],
    ["offers", "Offers", 26],
    ["placements", "Placements", 8],
  ].map(([key, label, actual]) => ({ key, label, actual, target: targets[key] ?? null, pct: pct(actual, targets[key]) })),
});

const top = (rank, id, name, s, i, o, p, match, hours, trend) => ({
  rank, id, name, avatarUrl: null, submissions: s, interviews: i, offers: o, placements: p, matchRatePct: match, lastActivityAt: ago(hours * H), trend,
});

const view = (weeks) => ({
  generatedAt: new Date().toISOString(),
  kpis: [
    { key: "assignedConsultants", value: 28, deltaPct: 12, sparkline: [3, 4, 4, 6, 5, 8, 9, 11] },
    { key: "activeSubmissions", value: 142, deltaPct: 18, sparkline: [60, 70, 66, 90, 95, 110, 120, 142] },
    { key: "interviewRate", value: 32, deltaPct: 5, sparkline: [28, 30, 29, 31, 30, 33, 31, 32] },
    { key: "offerRate", value: 18, deltaPct: 6, sparkline: [14, 15, 17, 16, 18, 17, 19, 18] },
    { key: "placements", value: 8, deltaPct: 33, sparkline: [1, 2, 1, 3, 2, 4, 5, 8] },
    { key: "followupCompletion", value: 86, deltaPct: 11, sparkline: [70, 74, 72, 78, 80, 82, 84, 86] },
  ],
  weekly: {
    period: `${weeks}w`,
    weeks: WEEK_STARTS.slice(-weeks).map((start, i, all) => {
      const k = WEEK_STARTS.length - all.length + i;
      return { start, end: addDays(start, 6), submissions: SUBS[k], interviews: INTS[k], offers: OFFS[k] };
    }),
  },
  trend: { period: "3m", points: TREND_DATES.map((date, i) => ({ date, submissions: TREND_S[i], interviews: TREND_I[i], offers: TREND_O[i] })) },
  funnel: {
    period: "3m",
    total: 142,
    stages: [
      { key: "submissions", label: "Submissions", count: 142, pct: 100 },
      { key: "interviews", label: "Interviews", count: 46, pct: 32 },
      { key: "offers", label: "Offers", count: 26, pct: 18 },
      { key: "placements", label: "Placements", count: 12, pct: 8 },
    ],
  },
  readiness: {
    total: 28,
    buckets: [
      { key: "ready", label: "Ready to Submit", count: 15, pct: 54 },
      { key: "progress", label: "In Progress", count: 8, pct: 29 },
      { key: "attention", label: "Needs Attention", count: 3, pct: 11 },
      { key: "inactive", label: "Inactive", count: 2, pct: 7 },
    ],
  },
  streams: {
    period: "3m",
    rows: [
      { clientId: 1, client: "TechCorp", submissions: 48, interviews: 18, offers: 10, placements: 5, offerRatePct: 21, good: true },
      { clientId: 2, client: "Global Bank", submissions: 36, interviews: 12, offers: 7, placements: 3, offerRatePct: 19, good: true },
      { clientId: 3, client: "HealthPlus", submissions: 28, interviews: 8, offers: 4, placements: 2, offerRatePct: 14, good: false },
      { clientId: 4, client: "CloudScale", submissions: 20, interviews: 6, offers: 3, placements: 1, offerRatePct: 15, good: false },
      { clientId: 5, client: "ACME Internal", submissions: 10, interviews: 2, offers: 2, placements: 1, offerRatePct: 20, good: true },
    ],
  },
  top: [
    top(1, 1, "Alex Morgan", 28, 12, 7, 4, 86, 2, [2, 3, 3, 4, 4, 5, 5, 6]),
    top(2, 2, "Priya Sharma", 24, 10, 5, 3, 82, 5, [2, 2, 3, 3, 4, 4, 5, 5]),
    top(3, 3, "Michael Park", 22, 8, 4, 2, 78, 24, [1, 2, 3, 3, 3, 4, 4, 5]),
    top(4, 4, "Emily Lawson", 18, 6, 4, 2, 76, 4, [1, 2, 2, 3, 3, 3, 4, 4]),
    top(5, 5, "David Kim", 16, 5, 3, 1, 71, 24, [1, 1, 2, 2, 3, 3, 3, 4]),
  ],
  benchmarks: {
    period: "month",
    rows: [
      { key: "interviewRate", label: "Interview Rate", value: 32, deltaPct: 5, industry: 25 },
      { key: "offerRate", label: "Offer Rate", value: 18, deltaPct: 6, industry: 12 },
      { key: "placementRate", label: "Placement Rate", value: 8, deltaPct: 3, industry: 5 },
    ],
  },
  goals: goals(),
  actions: [
    { key: "quiet", text: "Follow up with 12 consultants", detail: "with no recent activity", page: "followups" },
    { key: "interviewing", text: "Focus on 8 high-potential candidates", detail: "in interview stage", page: "interviews" },
    { key: "matches", text: "Explore 15 new job matches", detail: "for top performers", page: "matches" },
    { key: "offerRate", text: "Improve offer rate for TechCorp opportunities", detail: null, page: "submissions" },
  ],
});

const readBody = (req) =>
  new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(s || "{}"));
      } catch {
        resolve({});
      }
    });
  });

export function createMktPerformanceMock({ json, subOf = () => null }) {
  return function handle(req, res, path, method) {
    const m = /^\/api\/orgs\/(\d+)\/mkt\/performance(\/goals)?$/.exec(path);
    if (!m) return false;
    const login = subOf(req);
    if (Number(m[1]) !== 2 || !login || !MEMBERS.has(login)) return req.resume(), json(res, 404, { status: 404, code: "NOT_FOUND" }), true;
    if (m[2]) {
      if (method !== "PUT") return req.resume(), json(res, 405, { status: 405 }), true;
      void readBody(req).then((b) => {
        for (const [k, v] of Object.entries(b)) {
          if (!(k in targets) || !Number.isInteger(v) || v < 0 || v > 100000) return json(res, 400, { status: 400, title: "invalid target" });
          targets[k] = v;
        }
        return json(res, 200, goals());
      });
      return true;
    }
    req.resume();
    if (method !== "GET") return json(res, 405, { status: 405 }), true;
    const w = new URL(req.url, "http://x").searchParams.get("weeks");
    return json(res, 200, view(w === "4w" ? 4 : 8)), true;
  };
}
