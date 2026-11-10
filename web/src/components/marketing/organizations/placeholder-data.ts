/**
 * PLACEHOLDER — board copy, not verified; replace with real values before version2 is promoted
 *
 * Every number, name and quote on /organizations that reads like a claim about real customers
 * lives here (spec section 13). The markup renders whatever is in this file; nothing of the
 * sort is hard-coded in JSX.
 */

/** The hero's "Organization Overview" card. */
export const OVERVIEW = {
  title: "Organization Overview",
  range: "Last 30 days",
  stats: [
    { label: "Organizations", value: "248", tone: "blue" },
    { label: "Applications", value: "1,243", tone: "coral" },
    { label: "Interviews", value: "320", tone: "teal" },
    { label: "Placements", value: "86", tone: "green" },
  ],
  pipelineTitle: "Placement Pipeline",
  /** `weight` is the segment's share of the bar (the board draws it unevenly, not to scale). */
  pipeline: [
    { label: "Applied", value: "1,243", weight: 42, tone: "violet" },
    { label: "In Review", value: "320", weight: 24, tone: "blue" },
    { label: "Interview", value: "180", weight: 14, tone: "teal" },
    { label: "Offer", value: "52", weight: 8, tone: "amber" },
    { label: "Placed", value: "86", weight: 12, tone: "green" },
  ],
} as const;

/** Mobile-only stat strip under the hero (mobile board). */
export const MOBILE_STRIP = [
  { value: "1,240", label: "Employees", tone: "blue" },
  { value: "312", label: "Active Jobs", tone: "green" },
  { value: "2,800", label: "Applications", tone: "blue" },
  { value: "96%", label: "Placement Support", tone: "blue" },
] as const;

/** "Team Management" table in the Collaboration & Oversight block. */
export const TEAM_ROWS = [
  { name: "Alex Chen", role: "Product Designer", owner: "Sarah Kim", ownerRole: "Career Coach", stage: "Interview", tone: "green", activity: "2 days ago" },
  { name: "Maria Lopez", role: "Marketing Specialist", owner: "James Park", ownerRole: "Recruiter", stage: "Applied", tone: "blue", activity: "1 day ago" },
  { name: "David Kim", role: "Software Engineer", owner: "Priya Shah", ownerRole: "Career Coach", stage: "Offer", tone: "green", activity: "3 days ago" },
  { name: "Emily Carter", role: "UX Designer", owner: "Michael Tan", ownerRole: "Recruiter", stage: "In Review", tone: "blue", activity: "1 day ago" },
  { name: "Chris Nguyen", role: "Data Analyst", owner: "Sarah Kim", ownerRole: "Career Coach", stage: "Applied", tone: "amber", activity: "2 days ago" },
] as const;

/** Reporting & Insights: the four headline tiles. */
export const REPORT_TILES = [
  { label: "Applications", value: "1,243", delta: "24%", tone: "blue" },
  { label: "Interviews", value: "320", delta: "18%", tone: "violet" },
  { label: "Offers", value: "124", delta: "32%", tone: "green" },
  { label: "Placements", value: "86", delta: "28%", tone: "amber" },
] as const;

export const REPORT_RANGE = "Last 90 days";

/** "Application Velocity": weekly bars plus a trend line over Jan-Jun (values on a 0-90 axis). */
export const VELOCITY = {
  title: "Application Velocity",
  legend: ["Applications", "Interviews"],
  axis: [90, 60, 30, 0],
  months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
  max: 90,
  /** Trend line, evenly spaced left to right. */
  line: [18, 28, 29, 52, 44, 42, 47, 40, 62],
  /** Weekly bars. */
  bars: [8, 4, 10, 6, 9, 20, 13, 7, 14, 26, 20, 4, 18, 10, 24, 12, 16, 8, 22, 17, 15, 21, 18, 32],
  tooltip: { value: "124", label: "Applications this week" },
} as const;

/**
 * "Placement Outcomes". The legend percentages are copied from the board as drawn (they do not
 * sum to 100); `ring` is the share of each coloured arc as the board draws it.
 */
export const OUTCOMES = {
  title: "Placement Outcomes",
  centerValue: "86",
  centerLabel: "Placed",
  legend: [
    { label: "Placed", value: "86", pct: "28%", dot: "bg-v2-green" },
    { label: "Offer", value: "52", pct: "17%", dot: "bg-v2-blue" },
    { label: "Interview", value: "180", pct: "24%", dot: "bg-[#2F3FD8]" },
    { label: "In Review", value: "320", pct: "26%", dot: "bg-v2-coral" },
    { label: "Applied", value: "605", pct: "49%", dot: "bg-[#B79CF7]" },
  ],
  /** Arc shares, clockwise from 12 o'clock, then the colours (CSS values). */
  ring: [
    { share: 28, color: "#20B33D" },
    { share: 17, color: "#F5A623" },
    { share: 30, color: "#B66BF2" },
    { share: 25, color: "#8FBBF5" },
  ],
} as const;

/** The closing band's testimonial. */
export const ORG_TESTIMONIAL = {
  quote:
    "Kiwiply has transformed how we support our job seekers. We can track progress, collaborate as a team, and most importantly, help more people land great opportunities.",
  name: "Priya Shah",
  role: "Director of Career Services",
  stars: 5,
} as const;
