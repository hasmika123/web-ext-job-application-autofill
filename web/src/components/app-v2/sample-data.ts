/**
 * SAMPLE — board data, not from the API; replace when the feature ships.
 *
 * One file for the whole signed-in app: Home + Jobs (app-home-dashboard, app-job-search[-split],
 * app-job-detail), then Saved Jobs, AI Apply, My Applications, Interviews, Resume Builder and the
 * coming-soon pages (app-saved-jobs, app-ai-apply-*, app-my-applications, app-interviews,
 * app-resume-builder), all transcribed from design/app-v2/*.webp. Real data (name, applications, resumes, Pro
 * matches) is merged over this in the pages; when a real list is empty the sample rows render so the
 * page looks like the board (see APP-V2-SPEC section 1.3).
 */

/* ── Jobs (Job Search list + split view + Job detail + Home "Recommended Jobs") ──────────── */

export type WorkMode = "Remote" | "Hybrid" | "On-site";

export interface SampleJob {
  id: string;
  title: string;
  company: string;
  location: string;
  /** null for real matches that don't say. */
  mode: WorkMode | null;
  tags: string[];
  /** Match score shown on the list board (and the detail board). */
  score: number;
  posted: string;
  /** Overrides used by the split-view board, which draws the same jobs with slightly different numbers. */
  split?: Partial<{ score: number; posted: string; tags: string[]; mode: WorkMode }>;
  /** Present for real (Pro) matches only. */
  real?: { reason: string | null; url: string; applyUrl: string | null };
}

export const SAMPLE_JOBS: SampleJob[] = [
  {
    id: "google-swe-intern",
    title: "Software Engineer Intern",
    company: "Google",
    location: "Mountain View, CA",
    mode: "Remote",
    tags: ["Internship", "Software Engineering", "Python", "Distributed Systems"],
    score: 95,
    posted: "2 days ago",
    split: { score: 96, tags: ["Internship", "Software Engineering", "Remote"] },
  },
  {
    id: "ms-frontend-intern",
    title: "Frontend Developer Intern",
    company: "Microsoft",
    location: "Redmond, WA",
    mode: "Hybrid",
    tags: ["Internship", "Frontend", "React", "TypeScript"],
    score: 93,
    posted: "3 days ago",
    split: { score: 88, posted: "4 days ago", tags: ["Internship", "Frontend", "React"] },
  },
  {
    id: "amazon-product-analyst-intern",
    title: "Product Analyst Intern",
    company: "Amazon",
    location: "Seattle, WA",
    mode: "Hybrid",
    tags: ["Internship", "Product", "Data Analysis", "SQL"],
    score: 90,
    posted: "1 day ago",
  },
  {
    id: "netflix-ml-intern",
    title: "Machine Learning Intern",
    company: "Netflix",
    location: "Los Gatos, CA",
    mode: "Remote",
    tags: ["Internship", "Machine Learning", "Python", "AI/ML"],
    score: 98,
    posted: "4 days ago",
    split: { score: 82, posted: "6 days ago", mode: "Hybrid", tags: ["Internship", "Machine Learning", "Python"] },
  },
  {
    id: "stripe-swe-intern",
    title: "Software Engineer Intern",
    company: "Stripe",
    location: "San Francisco, CA",
    mode: "Hybrid",
    tags: ["Internship", "Backend", "Go", "Cloud"],
    score: 86,
    posted: "2 days ago",
  },
  {
    id: "apple-ios-intern",
    title: "iOS Developer Intern",
    company: "Apple",
    location: "Cupertino, CA",
    mode: "On-site",
    tags: ["Internship", "iOS", "Swift", "Mobile Development"],
    score: 84,
    posted: "5 days ago",
  },
  {
    id: "amazon-pm-intern",
    title: "Product Manager Intern",
    company: "Amazon",
    location: "Seattle, WA",
    mode: "Hybrid",
    tags: ["Internship", "Product"],
    score: 92,
    posted: "3 days ago",
    split: { tags: ["Internship", "Product", "Hybrid"] },
  },
  {
    id: "meta-swe-intern",
    title: "Software Engineering Intern",
    company: "Meta",
    location: "Menlo Park, CA",
    mode: "Remote",
    tags: ["Internship", "Software Engineering", "Remote"],
    score: 86,
    posted: "5 days ago",
  },
  {
    id: "databricks-data-analyst-intern",
    title: "Data Analyst Intern",
    company: "Databricks",
    location: "San Francisco, CA",
    mode: "Hybrid",
    tags: ["Internship", "Data Analytics", "SQL"],
    score: 84,
    posted: "6 days ago",
  },
  {
    id: "meta-frontend-intern",
    title: "Frontend Developer Intern",
    company: "Meta",
    location: "Menlo Park, CA",
    mode: "Hybrid",
    tags: ["Internship", "Frontend"],
    score: 89,
    posted: "3 days ago",
  },
  {
    id: "ms-swe-intern",
    title: "Software Engineer Intern",
    company: "Microsoft",
    location: "Redmond, WA",
    mode: "Hybrid",
    tags: ["Internship", "Software Engineering"],
    score: 92,
    posted: "4 days ago",
  },
  {
    id: "amazon-sde-intern",
    title: "SDE Intern",
    company: "Amazon",
    location: "Seattle, WA",
    mode: "Hybrid",
    tags: ["Internship", "Full Stack"],
    score: 90,
    posted: "4 days ago",
  },
];

/** Job Search list board (no selection): the six rows drawn, in order. */
export const JOB_LIST_IDS = [
  "google-swe-intern",
  "ms-frontend-intern",
  "amazon-product-analyst-intern",
  "netflix-ml-intern",
  "stripe-swe-intern",
  "apple-ios-intern",
];

/** Job Search split board (a row is selected): the six rows drawn, in order. */
export const JOB_SPLIT_IDS = [
  "google-swe-intern",
  "amazon-pm-intern",
  "ms-frontend-intern",
  "meta-swe-intern",
  "databricks-data-analyst-intern",
  "netflix-ml-intern",
];

/** Home "Recommended Jobs". */
export const HOME_RECOMMENDED_IDS = ["google-swe-intern", "meta-frontend-intern", "amazon-pm-intern"];

/** Job detail "Similar Jobs". */
export const SIMILAR_JOB_IDS = ["ms-swe-intern", "amazon-sde-intern"];

export const JOB_TABS = [
  { id: "recommended", label: "Recommended for You", count: 124 },
  { id: "latest", label: "Latest", count: 320 },
  { id: "remote", label: "Remote", count: 188 },
  { id: "high", label: "High Match", count: 96 },
  { id: "internships", label: "Internships", count: 64 },
];

export const JOB_FILTER_CHIPS = ["United States", "Full-time", "Remote / Hybrid", "Experience Level", "Salary Range", "Industry"];

export const JOB_SPLIT_FILTERS = ["Job Type", "Experience", "Salary", "Company", "Remote", "Date Posted"];

export const JOB_PREFERENCES = [
  { icon: "target", label: "Target Roles", value: "Software Engineer, Frontend, Product", tone: "coral" },
  { icon: "pin", label: "Preferred Locations", value: "United States, Remote / Hybrid", tone: "blue" },
  { icon: "salary", label: "Salary Range", value: "$70,000+", tone: "green" },
  { icon: "briefcase", label: "Job Type", value: "Internship, Full-time", tone: "violet" },
  { icon: "building", label: "Industries", value: "Technology, AI/ML, Consumer Products", tone: "violet" },
] as const;

export const JOB_ALERTS = [
  { icon: "clock", label: "New matching jobs", hint: "Get notified about new opportunities", tone: "amber" },
  { icon: "send", label: "Weekly summary", hint: "Receive a weekly email digest", tone: "coral" },
  { icon: "clock", label: "Interview updates", hint: "Get notified about interview status", tone: "green" },
] as const;

export const POPULAR_SEARCHES = [
  "Software Engineer",
  "Frontend Developer",
  "Data Analyst",
  "Product Manager",
  "Machine Learning",
  "iOS Developer",
  "Internship",
  "Remote",
  "Amazon",
  "Google",
];

export const CAREER_TIP = "Tailor your resume for each application to increase your chances by up to 3x!";

/** The detail content of a job. Only Google has board copy; the rest are generated from the job. */
export interface JobDetailContent {
  salary: string;
  applicants: string;
  workMode: string;
  duration: string;
  monthly: string;
  description: string;
  responsibilities: string[];
  required: string[];
  preferred: string[];
  skillsHave: string[];
  skillsImprove: string[];
  match: { value: number; headline: string; blurb: string; checks: string[] };
  insights: { title: string; body: string; tone: "green" | "amber" | "blue" }[];
  about: { name: string; blurb: string; industry: string; size: string; hq: string; site: string };
  additional: { deadline: string; auth: string; visa: string; relocation: string; fn: string; size: string; industry: string; website: string };
  stickyNote: string;
  postedDetail: string;
  applications: string;
  verified: boolean;
}

export const GOOGLE_DETAIL: JobDetailContent = {
  salary: "$8K - $12K/month",
  applicants: "1,425 applicants",
  workMode: "On-site/Remote",
  duration: "Summer 2027",
  monthly: "$7,000 - $9,000",
  description:
    "Join Google as a Software Engineer Intern and work with world-class engineers to build products that impact billions of users. You'll work on real projects, solve meaningful problems, and gain hands-on experience in a supportive and inclusive environment.",
  responsibilities: [
    "Design, develop, and test software solutions at scale",
    "Work on real-world projects with cross-functional teams",
    "Write clean, maintainable, and efficient code",
    "Participate in code reviews and technical design discussions",
    "Collaborate with product managers and UX designers",
    "Contribute to improve performance, scalability, and reliability",
  ],
  required: [
    "Currently enrolled in a Bachelor's or Master's degree in Computer Science or related field",
    "Strong programming skills in one or more languages (Python, Java, C++, or Go)",
    "Data structures and algorithms knowledge",
    "Excellent problem-solving and communication skills",
    "Ability to work collaboratively in a fast-paced environment",
    "Available for Summer 2027 (10–12 weeks)",
  ],
  preferred: [
    "Experience with distributed systems or cloud technologies",
    "Open source contributions or personal projects",
    "Familiarity with machine learning or AI/ML",
    "Leadership experience in student organizations",
  ],
  skillsHave: ["Python", "Data Structures", "Algorithms", "System Design", "React", "SQL", "Git", "Problem Solving"],
  skillsImprove: ["Distributed Systems", "Cloud (GCP)"],
  match: {
    value: 95,
    headline: "Excellent Match!",
    blurb: "Your skills and experience are a great fit for this role.",
    checks: ["Skills Match", "Experience Level", "Education", "Location Preference", "Job Type Preference"],
  },
  insights: [
    { title: "High chance of interview", body: "You have a 78% higher chance based on your profile.", tone: "green" },
    { title: "Add these skills", body: "Consider highlighting: System Design, Cloud, Go", tone: "amber" },
    { title: "Resume suggestions", body: "Showcase relevant projects and quantify your impact.", tone: "blue" },
  ],
  about: {
    name: "Google",
    blurb: "Organizing the world's information and making it universally accessible and useful.",
    industry: "Technology",
    size: "100,000+ employees",
    hq: "Mountain View, CA",
    site: "https://www.google.com",
  },
  additional: {
    deadline: "Jan 15, 2027",
    auth: "Students (F1/J1)",
    visa: "Yes",
    relocation: "Yes",
    fn: "Engineering",
    size: "100,000+",
    industry: "Technology",
    website: "https://careers.google.com",
  },
  stickyNote: "Big ideas start with great interns!",
  postedDetail: "Posted 5 days ago",
  applications: "Applications: 2,341",
  verified: true,
};

/* ── Home dashboard ──────────────────────────────────────────────────────────────────────── */

export const HOME_KPIS = [
  { icon: "file", value: "24", label: "Applications", note: "↑ 12% this month", tone: "violet" },
  { icon: "calendar", value: "5", label: "Interviews", note: "↑ 2 upcoming", tone: "amber" },
  { icon: "offer", value: "3", label: "Offers", note: "1 decision pending", tone: "blue" },
  { icon: "chart", value: "68%", label: "Response Rate", note: "↑ 18% vs last month", tone: "pink" },
] as const;

export interface RecentApplication {
  title: string;
  company: string;
  status: string;
  date: string;
}

export const HOME_RECENT_APPLICATIONS: RecentApplication[] = [
  { title: "Software Engineer Intern", company: "Google", status: "Interview", date: "Oct 8, 2026" },
  { title: "Product Analyst Intern", company: "Amazon", status: "In Review", date: "Oct 6, 2026" },
  { title: "Frontend Developer Intern", company: "Microsoft", status: "In Review", date: "Oct 5, 2026" },
  { title: "Software Engineering Intern", company: "Meta", status: "Applied", date: "Oct 4, 2026" },
  { title: "Data Analyst Intern", company: "Databricks", status: "Interview", date: "Oct 2, 2026" },
];

export const HOME_PROGRESS = [
  { label: "Applied", value: 100, pct: "100%", tone: "blue" },
  { label: "In Review", value: 68, pct: "68%", tone: "amber" },
  { label: "Interview", value: 24, pct: "24%", tone: "violet" },
  { label: "Offer", value: 5, pct: "5%", tone: "green" },
] as const;

export const HOME_TOP_COMPANIES = [
  { name: "Google", applications: "12 applications", interviews: "3 interviews", pct: 80, tone: "blue" },
  { name: "Amazon", applications: "8 applications", interviews: "1 interview", pct: 55, tone: "amber" },
  { name: "Microsoft", applications: "6 applications", interviews: "1 interview", pct: 45, tone: "violet" },
  { name: "Meta", applications: "5 applications", interviews: "0 interviews", pct: 38, tone: "coral" },
  { name: "Apple", applications: "4 applications", interviews: "0 interviews", pct: 28, tone: "green" },
] as const;

export const HOME_SKILLS = {
  overall: 78,
  items: [
    { label: "Python", value: 90 },
    { label: "JavaScript", value: 85 },
    { label: "System Design", value: 70 },
    { label: "Data Structures", value: 65 },
    { label: "SQL", value: 80 },
  ],
};

export const HOME_AI_ACTIONS = [
  { label: "Find jobs for me", href: "/jobs", tone: "violet", icon: "sparkles" },
  { label: "Tailor my resume", href: "/resume", tone: "blue", icon: "file" },
  { label: "Write a cover letter", href: "/resume#cover-letter", tone: "violet", icon: "pencil" },
  { label: "Prepare for an interview", href: "/interviews", tone: "violet", icon: "calendar" },
  { label: "Research a company", href: "/companies", tone: "blue", icon: "building" },
] as const;

export const HOME_TASKS = [
  { label: "Complete Google application", done: false },
  { label: "Prepare for Amazon interview", done: true, time: "10:00 AM" },
  { label: "Update resume with new project", done: false },
  { label: "Follow up on 2 applications", done: false },
];

export const HOME_UPCOMING_INTERVIEWS = [
  { title: "Software Engineer Intern", company: "Google", when: "Oct 10, 2026 · 10:00 AM" },
  { title: "Product Analyst Intern", company: "Amazon", when: "Oct 12, 2026 · 2:00 PM" },
];

export const HOME_SAVED_JOBS = [
  { title: "Backend Developer Intern", company: "Netflix", meta: "Netflix · Remote" },
  { title: "ML Engineer Intern", company: "OpenAI", meta: "OpenAI · San Francisco, CA" },
  { title: "Software Engineer Intern", company: "Tesla", meta: "Tesla · Palo Alto, CA" },
];

export const HOME_INSIGHT = {
  headline: "You're in the top 25%",
  body: "of applicants for Software Engineer Intern roles.",
  skillsToImprove: ["System Design", "Data Structures", "Behavioral Interviews"],
  recommended: [
    { title: "Mastering Coding Interviews", meta: "4 week program", tone: "violet" },
    { title: "System Design Fundamentals", meta: "Self-paced course", tone: "blue" },
  ],
};

export const HOME_LEARNING = [
  { title: "Coding Interview Prep", meta: "4 week program", tone: "coral" },
  { title: "Resume That Gets Noticed", meta: "Guide + Templates", tone: "blue" },
  { title: "System Design Basics", meta: "Self-paced course", tone: "violet" },
] as const;

/* ── Saved Jobs ───────────────────────────────────────────────────────────────────── */

export interface SavedJobSample {
  id: string;
  title: string;
  company: string;
  location: string;
  mode: "Remote" | "Hybrid" | "On-site";
  tags: string[];
  match: number;
  savedOn: string;
  applied: boolean;
  /** The two top matches get the primary "Apply with AI" button, the rest "View Job". */
  primaryAction: "apply" | "view";
}

export const SAVED_JOBS: SavedJobSample[] = [
  { id: "sv-1", title: "Software Engineer Intern", company: "Google", location: "Mountain View, CA", mode: "Remote", tags: ["Internship", "Software Engineering", "Frontend"], match: 95, savedOn: "Oct 6, 2026", applied: false, primaryAction: "apply" },
  { id: "sv-2", title: "Frontend Developer Intern", company: "Microsoft", location: "Redmond, WA", mode: "Hybrid", tags: ["Internship", "Frontend", "React"], match: 92, savedOn: "Oct 5, 2026", applied: false, primaryAction: "apply" },
  { id: "sv-3", title: "Product Analyst Intern", company: "Amazon", location: "Seattle, WA", mode: "Hybrid", tags: ["Internship", "Product", "Analytics"], match: 88, savedOn: "Oct 4, 2026", applied: false, primaryAction: "view" },
  { id: "sv-4", title: "Machine Learning Intern", company: "Netflix", location: "Los Gatos, CA", mode: "On-site", tags: ["Internship", "Machine Learning", "Python"], match: 86, savedOn: "Oct 3, 2026", applied: false, primaryAction: "view" },
  { id: "sv-5", title: "Software Engineer Intern", company: "Meta", location: "Menlo Park, CA", mode: "Hybrid", tags: ["Internship", "Backend", "Distributed Systems"], match: 84, savedOn: "Oct 2, 2026", applied: true, primaryAction: "view" },
  { id: "sv-6", title: "iOS Developer Intern", company: "Apple", location: "Cupertino, CA", mode: "On-site", tags: ["Internship", "iOS", "Swift"], match: 82, savedOn: "Sep 28, 2026", applied: true, primaryAction: "view" },
  { id: "sv-7", title: "Data Analyst Intern", company: "Databricks", location: "San Francisco, CA", mode: "Hybrid", tags: ["Internship", "Data Analytics", "SQL"], match: 80, savedOn: "Sep 26, 2026", applied: true, primaryAction: "view" },
];

/** The board's tab counts (the list above is its first page of 12). */
export const SAVED_TAB_COUNTS = { all: 12, high: 7, applied: 3, notApplied: 9, collections: 3 } as const;

export const SAVED_BENEFITS = [
  "All your saved jobs in one place",
  "Track status and next steps",
  "Get insights and match scores",
  "Never lose a great opportunity",
];

export const SAVED_COLLECTIONS: { label: string; count: number; tone: "green" | "amber" | "blue" | "violet" }[] = [
  { label: "All Saved Jobs", count: 12, tone: "green" },
  { label: "Top Picks", count: 5, tone: "amber" },
  { label: "Dream Companies", count: 4, tone: "blue" },
  { label: "Product Roles", count: 3, tone: "violet" },
];

export const SAVED_INSIGHTS = [
  "5 of your saved jobs are a strong match (85%+)",
  "2 jobs have recently posted similar roles",
  "Consider applying to 4 saved jobs this week",
  "Compare your saved jobs with salary and growth insights",
];

/* ── AI Apply ─────────────────────────────────────────────────────────────────────── */

export interface RecommendedJobSample {
  id: string;
  title: string;
  company: string;
  location: string;
  mode: string;
  tags: string[];
  posted: string;
  match: number;
}

export const RECOMMENDED_JOBS: RecommendedJobSample[] = [
  { id: "rj-1", title: "Software Engineer Intern", company: "Google", location: "Mountain View, CA", mode: "Remote", tags: ["Internship", "Software Engineering", "Remote"], posted: "Posted 2 days ago", match: 96 },
  { id: "rj-2", title: "Product Manager Intern", company: "Amazon", location: "Seattle, WA", mode: "Hybrid", tags: ["Internship", "Product", "Hybrid"], posted: "Posted 3 days ago", match: 92 },
  { id: "rj-3", title: "Frontend Developer Intern", company: "Microsoft", location: "Redmond, WA", mode: "Hybrid", tags: ["Internship", "Frontend", "React"], posted: "Posted 4 days ago", match: 88 },
  { id: "rj-4", title: "Software Engineering Intern", company: "Meta", location: "Menlo Park, CA", mode: "Remote", tags: ["Internship", "Software Engineering", "Remote"], posted: "Posted 5 days ago", match: 86 },
  { id: "rj-5", title: "Data Analyst Intern", company: "Databricks", location: "San Francisco, CA", mode: "Hybrid", tags: ["Internship", "Data Analytics", "SQL"], posted: "Posted 6 days ago", match: 84 },
];

export const FIND_FILTERS = ["Job Type", "Experience", "Salary", "Company", "Remote", "Date Posted"];

export const AI_SETTINGS_FIND = [
  { title: "Default Resume", sub: "Priya_Resume.pdf", tone: "violet" as const },
  { title: "Cover Letter Style", sub: "Standard (Professional)", tone: "coral" as const },
  { title: "Application Answers", sub: "Use AI to generate tailored answers", tone: "blue" as const },
  { title: "Preferred Job Types", sub: "Internship, Full-time", tone: "green" as const },
  { title: "Location Preferences", sub: "Remote, United States", tone: "blue" as const },
  { title: "Additional Preferences", sub: "Salary range, industries, etc.", tone: "amber" as const },
];

/** Bars of the "Application Activity" mini chart (Oct 1 - Oct 7). */
export const FIND_ACTIVITY: { label: string; value: number }[] = [
  { label: "Oct 1", value: 3 },
  { label: "Oct 2", value: 6 },
  { label: "Oct 3", value: 4 },
  { label: "Oct 4", value: 8 },
  { label: "Oct 5", value: 5 },
  { label: "Oct 6", value: 7 },
  { label: "Oct 7", value: 4 },
];

export const AUTO_APPLY_BENEFITS = [
  "Personalized for each job",
  "Answers tailored to the role",
  "Supports multiple platforms",
  "Track results in real time",
];

export interface CampaignSample {
  id: string;
  title: string;
  meta: string;
  created: string;
  active: boolean;
  applied: number;
  underReview: number;
  interviews: number;
  offers: number;
}

export const CAMPAIGNS: CampaignSample[] = [
  { id: "cp-1", title: "Software Engineer – Remote", meta: "Entry to Mid Level · United States · Remote", created: "Created Oct 5, 2026", active: true, applied: 48, underReview: 12, interviews: 6, offers: 2 },
  { id: "cp-2", title: "Frontend Developer", meta: "0-3 years · United States · Remote/Hybrid", created: "Created Oct 1, 2026", active: true, applied: 32, underReview: 8, interviews: 3, offers: 1 },
  { id: "cp-3", title: "Full Stack Engineer", meta: "Mid Level · United States · Hybrid", created: "Paused · Created Sep 20, 2026", active: false, applied: 28, underReview: 5, interviews: 2, offers: 0 },
];

export const AUTO_ADVANCED_FILTERS = ["Experience: 0-3 years", "Salary: 70k+", "Job Type", "Industry"];

export const AUTO_SETTINGS = [
  { title: "Target Job Titles", sub: "Software Engineer, Frontend, +3", tone: "coral" as const },
  { title: "Locations", sub: "United States (Remote/Hybrid)", tone: "blue" as const },
  { title: "Salary Range", sub: "$70,000+", tone: "green" as const },
  { title: "Job Types", sub: "Full-time, Contract", tone: "violet" as const },
  { title: "Exclude Companies", sub: "0 companies", tone: "coral" as const },
];

export interface AutoActivitySample {
  date: string;
  title: string;
  company: string;
  status: "Applied" | "Under Review" | "Interview";
  match: number;
}

export const AUTO_ACTIVITY: AutoActivitySample[] = [
  { date: "Oct 6, 2026", title: "Software Engineer", company: "Google", status: "Applied", match: 96 },
  { date: "Oct 6, 2026", title: "Frontend Developer", company: "Microsoft", status: "Applied", match: 92 },
  { date: "Oct 5, 2026", title: "Product Engineer", company: "Amazon", status: "Under Review", match: 88 },
  { date: "Oct 5, 2026", title: "Software Engineer", company: "Netflix", status: "Applied", match: 84 },
  { date: "Oct 4, 2026", title: "Backend Developer", company: "Meta", status: "Interview", match: 90 },
];

export const AUTO_ANALYTICS = {
  range: "Last 30 days",
  tiles: [
    { value: 108, label: "Applied", tone: "blue" as const },
    { value: 25, label: "Under Review", tone: "amber" as const },
    { value: 6, label: "Interviews", tone: "teal" as const },
    { value: 2, label: "Offers", tone: "green" as const },
  ],
  /** 30 daily bars Sep 8 - Oct 6, scale 0-30. */
  bars: [2, 5, 3, 4, 7, 6, 3, 5, 8, 6, 9, 7, 5, 10, 8, 11, 9, 12, 10, 14, 11, 13, 16, 12, 15, 18, 14, 22, 17, 13],
  xLabels: ["Sep 8", "Sep 15", "Sep 22", "Sep 29", "Oct 6"],
  yTicks: [30, 20, 10, 0],
};

export const AUTO_TIPS = [
  "Keep your resume updated",
  "Add more skills to improve match rate",
  "Enable notifications for interview updates",
  "Try multiple job title variations",
  "Review and refine AI preferences regularly",
];

/* ── My Applications ──────────────────────────────────────────────────────────────── */

export type AppStatusKey = "applied" | "in-review" | "interview" | "offer" | "rejected" | "withdrawn" | "draft";

export interface ApplicationRowSample {
  id: string;
  title: string;
  company: string;
  sub: string;
  status: AppStatusKey;
  appliedOn: string;
  nextStep: string;
  /** Second line of the Next Step cell (e.g. the interview time). */
  nextStepDetail?: string;
  href?: string | null;
}

export const APPLICATION_ROWS: ApplicationRowSample[] = [
  { id: "ap-1", title: "Software Engineer Intern", company: "Google", sub: "Internship · Remote", status: "interview", appliedOn: "Oct 8, 2026", nextStep: "Interview on", nextStepDetail: "Oct 10, 10:00 AM" },
  { id: "ap-2", title: "Product Analyst Intern", company: "Amazon", sub: "Internship · Seattle, WA", status: "in-review", appliedOn: "Oct 6, 2026", nextStep: "Waiting for response" },
  { id: "ap-3", title: "Frontend Developer Intern", company: "Microsoft", sub: "Internship · Redmond, WA", status: "in-review", appliedOn: "Oct 5, 2026", nextStep: "Waiting for response" },
  { id: "ap-4", title: "Software Engineering Intern", company: "Meta", sub: "Internship · Remote", status: "applied", appliedOn: "Oct 4, 2026", nextStep: "Application submitted" },
  { id: "ap-5", title: "Data Analyst Intern", company: "Databricks", sub: "Internship · San Francisco, CA", status: "interview", appliedOn: "Oct 2, 2026", nextStep: "Technical interview", nextStepDetail: "Oct 9, 2:00 PM" },
  { id: "ap-6", title: "Machine Learning Intern", company: "Netflix", sub: "Internship · Los Gatos, CA", status: "rejected", appliedOn: "Sep 28, 2026", nextStep: "Not selected" },
  { id: "ap-7", title: "iOS Developer Intern", company: "Apple", sub: "Internship · Cupertino, CA", status: "withdrawn", appliedOn: "Sep 20, 2026", nextStep: "Withdrawn by you" },
  { id: "ap-8", title: "Data Science Intern", company: "Airbnb", sub: "Internship · Remote", status: "in-review", appliedOn: "Sep 18, 2026", nextStep: "Waiting for response" },
];

/** Tab counts and tile numbers as drawn on the board (sample fallback only). */
export const APPLICATION_SAMPLE_COUNTS = { all: 24, "in-review": 5, interview: 3, offer: 2, rejected: 4, withdrawn: 1 } as const;
export const APPLICATION_SAMPLE_TILES = { total: 24, "in-review": 5, interview: 3, offer: 2, rejected: 8, withdrawn: 6 } as const;
export const APPLICATION_SAMPLE_PROGRESS = { "in-review": 5, interview: 3, offer: 2, rejected: 8, withdrawn: 6 } as const;

export const APPLICATION_INSIGHTS = [
  "You have 3 upcoming interviews. Prepare with AI.",
  "Your resume is a strong match (85%+) for 5 similar roles.",
  "Try applying to 8 more high-match jobs this week.",
];

export const APPLICATION_UPCOMING = [
  { id: "ui-1", title: "Software Engineer Intern", company: "Google", when: "Oct 10, 2026 · 10:00 AM (EST)", kind: "Video Interview" },
  { id: "ui-2", title: "Data Analyst Intern", company: "Databricks", when: "Oct 9, 2026 · 2:00 PM (EST)", kind: "Technical Interview" },
];

export const APPLICATION_ACTIVITY = [
  { id: "ac-1", title: "Application submitted", body: "Software Engineer Intern at Google", ago: "2 days ago", tone: "green" as const },
  { id: "ac-2", title: "Status updated to In Review", body: "Product Analyst Intern at Amazon", ago: "3 days ago", tone: "amber" as const },
  { id: "ac-3", title: "Interview scheduled", body: "Data Analyst Intern at Databricks", ago: "4 days ago", tone: "blue" as const },
];

/* ── Interviews ───────────────────────────────────────────────────────────────────── */

export interface InterviewSample {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  round: string;
  date: string;
  time: string;
  mode: string;
  primary: "Join Meeting" | "View Details";
}

export const UPCOMING_INTERVIEWS: InterviewSample[] = [
  { id: "iv-1", title: "Software Engineer Intern", company: "Google", location: "Remote", type: "Technical Interview", round: "Round 2", date: "Oct 10, 2026", time: "10:00 AM – 11:00 AM (EST)", mode: "Video Call", primary: "Join Meeting" },
  { id: "iv-2", title: "Product Analyst Intern", company: "Amazon", location: "Seattle, WA", type: "Behavioral Interview", round: "Round 1", date: "Oct 12, 2026", time: "2:00 PM – 3:00 PM (EST)", mode: "", primary: "Join Meeting" },
  { id: "iv-3", title: "Frontend Developer Intern", company: "Microsoft", location: "Redmond, WA", type: "Technical Interview", round: "Final Round", date: "Oct 15, 2026", time: "11:00 AM – 12:00 PM (EST)", mode: "", primary: "View Details" },
];

export const INTERVIEW_TABS = ["Upcoming Interviews", "Past Interviews", "Practice & Preparation", "Interview Resources"];

export const INTERVIEW_DETAIL_TABS = ["Overview", "Preparation Plan", "Notes", "Resources", "Company Info"];

export const INTERVIEW_DETAIL = {
  expectTitle: "What to Expect",
  expectBody: "This round will focus on data structures and algorithms, coding on a shared editor, and system design basics.",
  expectTags: ["Coding", "Data Structures", "Algorithms", "System Design", "Problem Solving"],
  topics: ["Arrays & Strings", "Trees & Graphs", "Dynamic Programming", "System Design Basics", "Time & Space Complexity"],
  quickActions: ["Start AI Mock Interview", "Review Similar Questions", "View Company Insights", "Read Interview Experiences"],
  /** Short bodies for the detail tabs other than Overview. */
  tabBodies: {
    "Preparation Plan": "Day 1: review arrays, strings and hash maps. Day 2: trees and graphs. Day 3: dynamic programming. Day 4: a timed mock interview, then review the feedback.",
    Notes: "Add your own notes here as you prepare - interviewer names, questions you want to ask, and anything to follow up on.",
    Resources: "Curated practice sets, the role's question bank and recorded walkthroughs will appear here.",
    "Company Info": "Mission, products, culture and recent news about the company will appear here.",
  } as Record<string, string>,
};

export const INTERVIEW_PREP = [
  { title: "AI Mock Interview", sub: "Practice with AI and get detailed feedback", tone: "violet" as const },
  { title: "Common Questions", sub: "Role-based question bank", tone: "coral" as const },
  { title: "Behavioral Questions", sub: "STAR method examples", tone: "blue" as const },
  { title: "Technical Preparation", sub: "DSA, System Design, Coding", tone: "green" as const },
  { title: "Company-Specific Prep", sub: "Learn about the company, culture and recent news", tone: "amber" as const },
];

export const INTERVIEW_TASKS = [
  { id: "tk-1", title: "Review Google interview prep notes", when: "Today, 9:00 AM", done: true },
  { id: "tk-2", title: "Solve 2 coding problems (Array, DP)", when: "Today, 5:00 PM", done: false },
  { id: "tk-3", title: "Update resume with latest project", when: "Tomorrow", done: false },
  { id: "tk-4", title: "Read about Amazon leadership principles", when: "Tomorrow", done: false },
];

export const PAST_INTERVIEWS = [
  { id: "pi-1", company: "Netflix", title: "Machine Learning Intern", meta: "Oct 5, 2026 · Completed", outcome: "Positive" as const },
  { id: "pi-2", company: "Databricks", title: "Data Analyst Intern", meta: "Oct 2, 2026 · Completed", outcome: "Positive" as const },
  { id: "pi-3", company: "Apple", title: "iOS Developer Intern", meta: "Sep 28, 2026 · Completed", outcome: "Waitlisted" as const },
];

/* ── Resume Builder ───────────────────────────────────────────────────────────────── */

export const RESUME_BENEFITS = ["AI-powered suggestions", "ATS-friendly templates", "Role-specific optimization", "Instant feedback"];

export const RESUME_TABS = [
  { value: "my-resume", label: "My Resume" },
  { value: "templates", label: "Templates" },
  { value: "ai-suggestions", label: "AI Suggestions" },
  { value: "cover-letter", label: "Cover Letter" },
  { value: "version-history", label: "Version History" },
];

export const RESUME_TEMPLATES = ["Modern", "Clean", "Professional", "Tech", "Creative", "Minimal"];

export const RESUME_SCORE = {
  total: 85,
  verdict: "Great!",
  parts: [
    { label: "Content", score: 88 },
    { label: "Skills Match", score: 82 },
    { label: "ATS Optimization", score: 84 },
    { label: "Formatting", score: 90 },
  ],
  tip: "Your resume is strong! Add 2-3 more measurable achievements to make it even better.",
};

export const RESUME_AI_POINTS = [
  "Improve bullet points with impact",
  "Add relevant skills for your target roles",
  "Optimize for ATS (Applicant Tracking Systems)",
  "Highlight achievements with metrics",
  "Fix grammar and formatting",
];

/** Shown only while the account has no resumes yet. */
export const RESUME_SAMPLE_VERSIONS = [
  { id: -1, label: "Priya_Resume.pdf", date: "Oct 5, 2026", version: 3, isDefault: true },
  { id: -2, label: "Priya_Resume_Product.pdf", date: "Sep 28, 2026", version: 2, isDefault: false },
  { id: -3, label: "Priya_Resume_SDE.pdf", date: "Sep 12, 2026", version: 1, isDefault: false },
];

/* ── Coming-soon pages (no boards) ────────────────────────────────────────────────── */

export interface ComingSoonSample {
  title: string;
  subtitle: string;
  note: string;
  mascot: "mascot-search" | "mascot-binoculars" | "mascot-books" | "mascot-apps" | "mascot-heart" | "mascot-resume" | "mascot-wave-laptop";
}

export const COMING_SOON: Record<"ai-tools" | "insights" | "messages" | "companies" | "networking" | "learning", ComingSoonSample> = {
  "ai-tools": {
    title: "AI Tools",
    subtitle: "Smart helpers for your job search: resume tailoring, cover letters and interview practice, all in one place.",
    note: "Your AI toolkit is on its way.",
    mascot: "mascot-wave-laptop",
  },
  insights: {
    title: "Career Insights",
    subtitle: "See how your search is going: response rates, in-demand skills and salary ranges for the roles you want.",
    note: "Insights to guide your next move.",
    mascot: "mascot-apps",
  },
  messages: {
    title: "Messages",
    subtitle: "Recruiter and employer replies, collected next to the applications they belong to.",
    note: "Every reply, one place.",
    mascot: "mascot-heart",
  },
  companies: {
    title: "Company Research",
    subtitle: "Know the company before you apply: culture, products, recent news and what interviews look like.",
    note: "Do your homework in minutes.",
    mascot: "mascot-binoculars",
  },
  networking: {
    title: "Networking",
    subtitle: "Find people at the companies you like and keep track of every conversation and follow-up.",
    note: "Opportunities start with people.",
    mascot: "mascot-search",
  },
  learning: {
    title: "Learning",
    subtitle: "Short courses and practice paths matched to the skills your target roles ask for.",
    note: "Grow into the role you want.",
    mascot: "mascot-books",
  },
};
