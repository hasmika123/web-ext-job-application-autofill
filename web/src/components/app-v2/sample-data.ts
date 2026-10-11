/**
 * SAMPLE — board data, not from the API; replace when the feature ships.
 *
 * Transcribed verbatim from design/app-v2/app-home-dashboard.webp, app-job-search.webp,
 * app-job-search-split.webp and app-job-detail.webp. Real data (name, applications, resumes, Pro
 * matches) is merged over this in the pages; when a real list is empty the sample rows render so the
 * page looks like the board (see APP-V2-SPEC section 1.3). Phase A2 keeps its own file
 * (`sample-data.pages.ts`); QA merges the two.
 */

/* ── Jobs (Job Search list + split view + Job detail + Home "Recommended Jobs") ──────────── */

export type WorkMode = "Remote" | "Hybrid" | "On-site";

export interface SampleJob {
  id: string;
  title: string;
  company: string;
  location: string;
  mode: WorkMode;
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
  status: "Interview" | "In Review" | "Applied";
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
