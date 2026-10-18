import type { Overview } from "./reports";

/** A believable overview for tests (shape only: the numbers are made up for the assertions, never shown by the product). */
export const overviewFixture = (over: Partial<Overview> = {}): Overview => ({
  orgId: 2,
  generatedAt: "2026-10-16T10:00:00Z",
  rangeDays: 30,
  tiles: [
    { key: "consultants", label: "Active consultants", value: 153, previous: null, unit: "count" },
    { key: "applications", label: "Applications in range", value: 60, previous: 50, unit: "count" },
    { key: "timeToSubmit", label: "Median time to first submission", value: 30, previous: null, unit: "hours" },
  ],
  roster: { total: 153, byMarketingStatus: [{ key: "ACTIVE", label: "Active", count: 100 }, { key: "PAUSED", label: "Paused", count: 53 }], byAvailability: [{ key: "AVAILABLE", label: "Available", count: 90 }] },
  funnel: {
    total: 60,
    thisWeek: 12,
    lastWeek: 10,
    deltaPct: 20,
    stages: [
      { key: "ASSIGNED", label: "Assigned", count: 20, enteredThisWeek: 5, enteredLastWeek: 4, deltaPct: 25 },
      { key: "SUBMITTED", label: "Submitted", count: 40, enteredThisWeek: 7, enteredLastWeek: 0, deltaPct: null },
    ],
    weekly: [{ weekStart: "2026-10-05", value: 8, second: 0 }, { weekStart: "2026-10-12", value: 12, second: 0 }],
  },
  interviews: { scheduled: 30, completed: 20, cancelled: 4, awaitingOutcome: 3, upcoming14Days: 9, weekly: [{ weekStart: "2026-10-05", value: 10, second: 7 }] },
  placements: { active: 12, startedInRange: 3, endedInRange: 1, months: [{ month: "2026-09", started: 2, ended: 1 }, { month: "2026-10", started: 1, ended: 0 }] },
  topClients: [{ name: '=HYPERLINK("http://evil")', activePlacements: 4 }, { name: "Globex, Inc", activePlacements: 2 }],
  marketers: [{ memberId: 7, name: "Omar Aziz", consultants: 12, openOpportunities: 9 }],
  firstSubmission: { medianHours: 30, sample: 14 },
  ...over,
});
