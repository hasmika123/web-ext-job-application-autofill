/**
 * The look of a page's title band: which bee pose and which of the six background designs (`data-variant` 0..5 in
 * `packages/ui/styles/theme-tenant.css`). Every page gets its own pair so the bands do not repeat from page to page. The pose
 * follows what the page is about (a calendar bee on Interviews, a lock bee on Roles); a page not listed here gets a stable pick from
 * its path, so the same page always looks the same. Poses are files in `public/ent/bee/<pose>.png`.
 */
export interface HeroLook {
  pose: string;
  variant: number;
}

export const HERO_VARIANTS = 6;

const POSE_BY_SEGMENT: Record<string, string> = {
  home: "welcome",
  employees: "collaboration",
  invitations: "notification",
  teams: "friendly",
  departments: "presenting",
  roles: "secure",
  consultants: "confident",
  resumes: "resume-help",
  "marketing-assignments": "tips-suggestions",
  jobs: "searching",
  applications: "reviewing",
  interviews: "scheduling",
  clients: "excited",
  placements: "success",
  subscription: "great-job",
  licenses: "approved",
  billing: "processing",
  usage: "climbing-up",
  reports: "analyzing",
  branding: "idea",
  domains: "working",
  audit: "thinking",
  settings: "typing",
  policies: "help-guidance",
  // marketing specialist
  talent: "searching",
  matches: "idea",
  opportunities: "excited",
  streams: "working",
  submissions: "task-complete",
  followups: "notification",
  tasks: "typing",
  activity: "relaxed-lounging",
  performance: "climbing-up",
  // marketing manager
  team: "collaboration",
  assignments: "tips-suggestions",
  pipeline: "analyzing",
  approvals: "approved",
  workload: "processing",
  escalations: "surprised",
  // consultant
  profile: "friendly",
  marketer: "collaboration",
  "job-discovery": "searching",
  "interview-prep": "thinking",
  offers: "great-job",
  availability: "scheduling",
  "activity-timeline": "reviewing",
  inbox: "notification",
  features: "tips-suggestions",
  notifications: "notification",
  me: "happy",
};

const FALLBACK_POSES = ["happy", "friendly", "confident", "excited", "working", "thinking", "idea", "reviewing"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** "/w/admin/employees" -> "employees"; a workspace home ("/w/admin") -> "home". */
export function pageSegment(pathname: string, isHome: boolean): string {
  if (isHome) return "home";
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "home";
}

export function heroLook(pathname: string, isHome: boolean): HeroLook {
  const seg = pageSegment(pathname, isHome);
  // the background follows the whole path so the same segment in two workspaces (Reports) still differs
  const key = isHome ? `home:${pathname}` : pathname;
  return { pose: POSE_BY_SEGMENT[seg] ?? FALLBACK_POSES[hash(seg) % FALLBACK_POSES.length], variant: hash(key) % HERO_VARIANTS };
}
