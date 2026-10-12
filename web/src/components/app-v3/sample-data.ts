/**
 * SAMPLE — board data, not from the API; replace when the feature ships.
 *
 * App v3 board data for every v3 page (APP-V3-SPEC section 2), merged from the per-phase files.
 * Real data (name, applications, resumes, Pro matches, profile, account, billing) is merged over
 * this in the pages; when a real list is empty the sample rows render so the page matches the board.
 */
import type { SampleJob, WorkMode } from "@/components/app-v2/sample-data";
import type { Tone } from "@/components/app-v2/common";

/* ═══ Dashboard + Job Search ═══ */
/* ── Job Search (2.2) ────────────────────────────────────────────────────────────────────── */

export type JobType = "Full-time" | "Part-time" | "Contract" | "Internship";
export type JobLevel = "Entry" | "Mid" | "Senior" | "Lead";

/** A job as Job Search draws it: the v2 SampleJob plus the fields the filter rail works on. */
export interface V3Job extends SampleJob {
  type: JobType | null;
  level: JobLevel | null;
  /** "$140K–$200K"; null when a real posting doesn't say. */
  salary: string | null;
  /** Annual, in $k, for the salary slider (null = unknown). */
  salaryMax: number | null;
  /** Days since posted, for sorting. */
  ageDays: number;
}

type Row = [
  id: string,
  title: string,
  company: string,
  location: string,
  mode: WorkMode,
  type: JobType,
  level: JobLevel,
  minK: number,
  maxK: number,
  tags: string[],
  score: number,
  ageDays: number,
];

// Board order first (the five spec rows), then the pool that fills pages 2-5 and the filters.
// 25 full-time rows so the default (Full-time ticked) view paginates 1-5.
const ROWS: Row[] = [
  ["google-swe", "Software Engineer", "Google", "Mountain View, CA", "Remote", "Full-time", "Mid", 140, 200, ["React", "TypeScript", "Next.js"], 95, 2],
  ["ms-fe", "Frontend Developer", "Microsoft", "Seattle, WA", "Hybrid", "Full-time", "Mid", 120, 170, ["React", "TypeScript", "Tailwind"], 88, 3],
  ["airbnb-swe", "Software Engineer", "Airbnb", "Remote", "Remote", "Full-time", "Mid", 135, 190, ["React", "Node.js", "GraphQL"], 86, 3],
  ["amazon-sde2", "SDE II", "Amazon", "Seattle, WA", "On-site", "Full-time", "Mid", 130, 185, ["Java", "AWS", "Distributed Systems"], 86, 2],
  ["meta-fe", "Frontend Engineer", "Meta", "Remote", "Remote", "Full-time", "Senior", 150, 210, ["React", "JavaScript", "GraphQL"], 84, 7],
  ["airbnb-fe", "Frontend Developer", "Airbnb", "San Francisco, CA", "Hybrid", "Full-time", "Mid", 125, 175, ["React", "TypeScript", "CSS"], 88, 4],
  ["netflix-fs", "Full Stack Engineer", "Netflix", "Los Gatos, CA", "Hybrid", "Full-time", "Senior", 150, 210, ["Node.js", "React", "AWS"], 83, 7],
  ["stripe-pe", "Product Engineer", "Stripe", "San Francisco, CA", "Hybrid", "Full-time", "Mid", 130, 180, ["React", "Node.js", "System Design"], 82, 7],
  ["uber-swe", "Software Engineer", "Uber", "San Francisco, CA", "On-site", "Full-time", "Mid", 135, 185, ["Go", "Java", "Kubernetes"], 81, 10],
  ["shopify-fe", "Frontend Developer", "Shopify", "Remote", "Remote", "Full-time", "Mid", 110, 150, ["React", "GraphQL", "Ruby"], 80, 10],
  ["tesla-swe", "Software Engineer", "Tesla", "Palo Alto, CA", "On-site", "Full-time", "Mid", 125, 170, ["C++", "Python", "Embedded"], 79, 12],
  ["stripe-be", "Backend Engineer", "Stripe", "Remote", "Remote", "Full-time", "Senior", 160, 220, ["Java", "Kafka", "AWS"], 78, 14],
  ["airbnb-de", "Data Engineer", "Airbnb", "Remote", "Remote", "Full-time", "Mid", 130, 175, ["Python", "Spark", "SQL"], 77, 14],
  ["apple-ui", "UI Engineer", "Apple", "Cupertino, CA", "Hybrid", "Full-time", "Lead", 170, 240, ["Swift", "TypeScript", "Design Systems"], 76, 15],
  ["netflix-fe", "Frontend Engineer", "Netflix", "Remote", "Remote", "Full-time", "Senior", 160, 230, ["React", "TypeScript", "Performance"], 76, 16],
  ["amazon-sde1", "SDE I", "Amazon", "Austin, TX", "On-site", "Full-time", "Entry", 105, 135, ["Java", "AWS", "DynamoDB"], 75, 18],
  ["uber-plat", "Platform Engineer", "Uber", "Remote", "Remote", "Full-time", "Lead", 180, 250, ["Kubernetes", "Go", "Terraform"], 74, 18],
  ["ms-swe", "Software Engineer", "Microsoft", "Redmond, WA", "Hybrid", "Full-time", "Senior", 150, 210, ["C#", "Azure", ".NET"], 74, 20],
  ["airbnb-fs", "Full Stack Developer", "Airbnb", "San Francisco, CA", "Hybrid", "Full-time", "Mid", 135, 185, ["React", "Node.js", "MySQL"], 73, 21],
  ["google-ml", "Machine Learning Engineer", "Google", "New York, NY", "Hybrid", "Full-time", "Senior", 170, 250, ["Python", "TensorFlow", "Kubernetes"], 72, 21],
  ["stripe-sfe", "Senior Frontend Engineer", "Stripe", "Remote", "Remote", "Full-time", "Senior", 165, 225, ["React", "TypeScript", "Accessibility"], 72, 22],
  ["meta-swe", "Software Engineer", "Meta", "Menlo Park, CA", "On-site", "Full-time", "Mid", 145, 205, ["React", "Hack", "GraphQL"], 71, 24],
  ["shopify-be", "Backend Developer", "Shopify", "Remote", "Remote", "Full-time", "Mid", 115, 160, ["Ruby", "Rails", "MySQL"], 70, 25],
  ["amazon-fe", "Frontend Engineer", "Amazon", "Seattle, WA", "Hybrid", "Full-time", "Mid", 125, 175, ["React", "TypeScript", "AWS"], 70, 26],
  ["google-fe", "Frontend Engineer", "Google", "Remote", "Remote", "Full-time", "Lead", 175, 245, ["Angular", "TypeScript", "Web Performance"], 69, 28],
  // Not full-time: only visible once Full-time is unticked or another type is ticked.
  ["google-intern", "Software Engineer Intern", "Google", "Mountain View, CA", "Remote", "Internship", "Entry", 96, 144, ["Python", "Algorithms"], 68, 5],
  ["ms-intern", "Software Engineer Intern", "Microsoft", "Redmond, WA", "On-site", "Internship", "Entry", 84, 120, ["C#", "Azure"], 66, 9],
  ["meta-contract", "Software Engineer (Contract)", "Meta", "Menlo Park, CA", "Hybrid", "Contract", "Senior", 100, 140, ["React", "JavaScript"], 65, 13],
  ["shopify-pt", "Software Engineer (Part-time)", "Shopify", "Remote", "Remote", "Part-time", "Mid", 50, 70, ["React", "Ruby"], 64, 17],
];

function postedLabel(ageDays: number): string {
  if (ageDays >= 7) {
    const w = Math.round(ageDays / 7);
    return `${w} week${w === 1 ? "" : "s"} ago`;
  }
  return `${ageDays} days ago`;
}

export const V3_JOBS: V3Job[] = ROWS.map(
  ([id, title, company, location, mode, type, level, minK, maxK, tags, score, ageDays]) => ({
    id,
    title,
    company,
    location,
    mode,
    type,
    level,
    tags,
    score,
    posted: postedLabel(ageDays),
    ageDays,
    salary: `$${minK}K–$${maxK}K`,
    salaryMax: maxK,
  }),
);

/** The board's headline count for the untouched sample list. */
export const JOBS_SAMPLE_TOTAL = 1234;
export const JOBS_PAGE_SIZE = 5;

export const JOB_TYPES: JobType[] = ["Full-time", "Part-time", "Contract", "Internship"];
export const JOB_LEVELS: JobLevel[] = ["Entry", "Mid", "Senior", "Lead"];
export const JOB_COMPANIES = ["Google", "Microsoft", "Amazon", "Meta", "Airbnb"];
export const JOB_SALARY_MAX_K = 300;

/** Detail panel copy (variant 3). Google's is the board's; the rest is generated from the job. */
export interface V3Detail {
  about: string;
  doing: string[];
  requirements: string[];
  benefits: string[];
  company: { blurb: string; industry: string; size: string; hq: string };
  reviews: { rating: string; count: string; quote: string };
}

export const GOOGLE_V3_DETAIL: V3Detail = {
  about:
    "Join Google as a Software Engineer and build products that reach billions of people. You'll own features end to end, from design through launch, alongside engineers who care about quality and craft.",
  doing: [
    "Design, build and ship scalable web features used by millions",
    "Write clean, well-tested code and review teammates' work",
    "Partner with product and design to shape what gets built",
    "Improve performance, reliability and accessibility",
    "Mentor newer engineers and share what you learn",
  ],
  requirements: [
    "3+ years building production web applications",
    "Strong skills in TypeScript, React and modern tooling",
    "Solid grounding in data structures, algorithms and system design",
    "Clear communication and a habit of working in the open",
    "Bachelor's degree in Computer Science or equivalent experience",
  ],
  benefits: [
    "Competitive salary, bonus and equity",
    "Comprehensive health, dental and vision coverage",
    "Flexible, hybrid-friendly work",
    "Learning budget and paid parental leave",
    "On-site meals, wellness and commuter perks",
  ],
  company: {
    blurb: "Organizing the world's information and making it universally accessible and useful.",
    industry: "Technology",
    size: "100,000+ employees",
    hq: "Mountain View, CA",
  },
  reviews: { rating: "4.5", count: "12,480 reviews", quote: "Brilliant colleagues and real ownership. Moves fast for a company this size." },
};


/* ═══ My Profiles, Settings ═══ */

/* ── 2.4 My Profiles ────────────────────────────────────────────────────────────────────────── */

export const V3_PROFILE_FALLBACK = {
  title: "Software Engineer",
  location: "San Francisco, CA",
  about:
    "Results-driven Software Engineer with 5+ years of experience building scalable web applications using React, Node.js and cloud technologies. Passionate about intuitive user experiences and solving complex problems.",
  skills: ["React", "TypeScript", "Node.js", "Next.js", "AWS", "Python"],
};

/** The "Multiple Profiles" row (the feature is not built yet; the first chip takes the user's title). */
export const V3_PROFILE_VARIANTS = ["Software Engineer", "Frontend Developer", "Data Scientist"] as const;

export const V3_RESUME_VERSION_SAMPLES = [
  { id: 0, label: "Software Engineer Resume", date: "Oct 8, 2026", isDefault: true },
  { id: -1, label: "Frontend Developer Resume", date: "Sep 30, 2026", isDefault: false },
  { id: -2, label: "Product Manager Resume", date: "Sep 12, 2026", isDefault: false },
];

/* ═══ AI Assistant, Job Alerts, Messages ═══ */

/* ── AI Assistant (2.5) ─────────────────────────────────────────────────────────────────── */

export const ASSISTANT_PROMPTS = [
  "Improve my resume",
  "Find matching jobs",
  "Prepare for interview",
  "Analyze job description",
  "Write a cover letter",
  "Negotiate a salary",
] as const;

/** Bullets inside the greeting bubble (text emoji are allowed in chat copy only). */
export const ASSISTANT_CAPABILITIES = [
  "Finding the right jobs",
  "Improving your resume",
  "Writing cover letters",
  "Preparing for interviews",
  "Career advice",
  "And much more!",
] as const;

export const ASSISTANT_RECENT_CHATS: { title: string; date: string }[] = [
  { title: "Resume feedback", date: "Oct 8" },
  { title: "Interview questions", date: "Oct 6" },
  { title: "Job search strategy", date: "Oct 4" },
  { title: "Cover letter help", date: "Sep 28" },
  { title: "Salary negotiation", date: "Sep 25" },
];

/** The one canned reply (no API call is made). */
export const ASSISTANT_CANNED_REPLY =
  "Kiwiply AI is coming soon — for now, try the Pro drafting features on your applications.";

/* ── Job Alerts (2.6) ───────────────────────────────────────────────────────────────────── */

export type AlertFrequency = "Immediate" | "Daily" | "Weekly";
export type AlertChannel = "Email" | "In-app";

export interface AlertSample {
  id: string;
  title: string;
  /** "Remote", "Remote · US", "San Francisco, CA". */
  location: string;
  /** Meta chips after the location: job type, salary floor. */
  meta: string[];
  tags: string[];
  frequency: AlertFrequency;
  channels: AlertChannel[];
  active: boolean;
  tone: Tone;
}

export const ALERTS: AlertSample[] = [
  {
    id: "a1",
    title: "Software Engineer",
    location: "Remote",
    meta: ["Full-time", "$100K+"],
    tags: ["React", "TypeScript"],
    frequency: "Daily",
    channels: ["Email", "In-app"],
    active: true,
    tone: "blue",
  },
  {
    id: "a2",
    title: "Frontend Developer",
    location: "Remote · US",
    meta: [],
    tags: [],
    frequency: "Immediate",
    channels: ["Email", "In-app"],
    active: true,
    tone: "violet",
  },
  {
    id: "a3",
    title: "Full Stack Engineer",
    location: "San Francisco, CA",
    meta: [],
    tags: [],
    frequency: "Daily",
    channels: ["Email"],
    active: true,
    tone: "green",
  },
  {
    id: "a4",
    title: "React Developer",
    location: "Remote · US",
    meta: [],
    tags: [],
    frequency: "Daily",
    channels: ["Email", "In-app"],
    active: true,
    tone: "teal",
  },
  {
    id: "a5",
    title: "Product Engineer",
    location: "New York, NY",
    meta: [],
    tags: [],
    frequency: "Daily",
    channels: ["In-app"],
    active: false,
    tone: "amber",
  },
  {
    id: "a6",
    title: "Data Engineer",
    location: "Remote · US",
    meta: [],
    tags: [],
    frequency: "Daily",
    channels: ["Email"],
    active: true,
    tone: "coral",
  },
];

export const ALERT_JOB_TYPES = ["Any", "Full-time", "Part-time", "Contract", "Internship"] as const;
export const ALERT_FREQUENCIES: AlertFrequency[] = ["Immediate", "Daily", "Weekly"];
export const ALERT_CHANNELS: AlertChannel[] = ["Email", "In-app"];

/** Notification Settings tab (client state only). */
export const ALERT_SETTINGS = [
  { id: "email", label: "Email notifications", description: "Get new matches in your inbox.", on: true },
  { id: "inapp", label: "In-app notifications", description: "Show new matches under the bell.", on: true },
  { id: "digest", label: "Daily digest", description: "Bundle all alerts into one summary each morning.", on: false },
  { id: "pause", label: "Pause all alerts", description: "Stop every alert without deleting it.", on: false },
] as const;

/* ── Messages (2.9) ─────────────────────────────────────────────────────────────────────── */

export interface ChatMessage {
  id: string;
  from: "them" | "me";
  text: string;
  time: string;
}

export interface Conversation {
  id: string;
  name: string;
  company: string;
  /** "Recruiter at Google" style subtitle in the thread header. */
  role: string;
  /** Extra word after the company in the list row ("Google · Recruiter"). */
  listRole?: string;
  preview: string;
  ago: string;
  unread: boolean;
  messages: ChatMessage[];
}

export const CONVERSATIONS: Conversation[] = [
  {
    id: "sarah",
    name: "Sarah Johnson",
    company: "Google",
    role: "Recruiter at Google",
    listRole: "Recruiter",
    preview: "Hi Priya, we'd like to schedule an interview...",
    ago: "2m ago",
    unread: true,
    messages: [
      {
        id: "s1",
        from: "them",
        text: "Hi Priya, We were impressed with your application and would like to schedule a 30-minute video interview. Are you available this week?",
        time: "10:24 AM",
      },
      {
        id: "s2",
        from: "me",
        text: "Hi Sarah! Thanks for the opportunity. I'm available on Thursday or Friday. Please let me know what time works best for you.",
        time: "10:31 AM",
      },
      { id: "s3", from: "them", text: "Thursday at 10 AM PST work for you?", time: "10:34 AM" },
    ],
  },
  {
    id: "alex",
    name: "Alex Chen",
    company: "Microsoft",
    role: "Talent Partner at Microsoft",
    preview: "Thanks for applying...",
    ago: "1h ago",
    unread: false,
    messages: [
      {
        id: "a1",
        from: "them",
        text: "Thanks for applying to the Frontend Developer role. We are reviewing applications this week and will be in touch.",
        time: "9:12 AM",
      },
    ],
  },
  {
    id: "airbnb",
    name: "Hiring Team",
    company: "Airbnb",
    role: "Hiring team at Airbnb",
    preview: "Your application is under review",
    ago: "3h ago",
    unread: false,
    messages: [
      {
        id: "h1",
        from: "them",
        text: "Your application is under review. We will update you as soon as the team has made a decision.",
        time: "7:45 AM",
      },
    ],
  },
  {
    id: "priya-patel",
    name: "Priya Patel",
    company: "Amazon",
    role: "Recruiter at Amazon",
    preview: "We've moved to the next round...",
    ago: "1d ago",
    unread: false,
    messages: [
      {
        id: "p1",
        from: "them",
        text: "Good news: we've moved your application to the next round. Someone from the team will share the details soon.",
        time: "Yesterday",
      },
    ],
  },
  {
    id: "emily",
    name: "Emily Davis",
    company: "Amazon",
    role: "Coordinator at Amazon",
    preview: "Can you share your availability?",
    ago: "2d ago",
    unread: false,
    messages: [
      {
        id: "e1",
        from: "them",
        text: "Can you share your availability for a short call next week?",
        time: "Mon",
      },
    ],
  },
  {
    id: "david",
    name: "David Wilson",
    company: "Meta",
    role: "Recruiter at Meta",
    preview: "Great to connect!",
    ago: "3d ago",
    unread: false,
    messages: [
      {
        id: "d1",
        from: "them",
        text: "Great to connect! I'll keep you in mind for upcoming frontend roles on our team.",
        time: "Sun",
      },
    ],
  },
];

export const MESSAGES_NOTE = "Messaging launches with Inbox v2 — these are examples";


/* ═══ Interview Prep, Explore, Analytics ═══ */

/* ── Interview Prep (spec 2.8) ─────────────────────────────────────────────────────── */

export const IP_TABS = [
  { id: "practice", label: "Practice" },
  { id: "questions", label: "Questions" },
  { id: "mock", label: "Mock Interviews" },
  { id: "sessions", label: "My Sessions" },
];

export const IP_MODES: { id: string; title: string; sub: string; tone: Tone }[] = [
  { id: "quick", title: "Quick Practice", sub: "5-10 min targeted questions", tone: "blue" },
  { id: "full", title: "Full Mock Interview", sub: "45-60 min, real interview simulation", tone: "violet" },
  { id: "behavioral", title: "Behavioral Questions", sub: "STAR method practice", tone: "green" },
  { id: "technical", title: "Technical Questions", sub: "Role-specific technical prep", tone: "amber" },
];

export const IP_ROLES = ["Software Engineer", "Frontend Developer", "Full Stack Developer", "Product Manager", "Data Scientist", "DevOps Engineer"];
export const IP_COMPANIES = ["Google", "Microsoft", "Amazon", "Meta", "Airbnb", "Netflix"];

export const IP_QUESTION_SETS: { title: string; sub: string; tone: Tone }[] = [
  { title: "Technical Questions", sub: "50 questions", tone: "blue" },
  { title: "Behavioral Questions", sub: "40 questions", tone: "green" },
  { title: "System Design", sub: "25 questions", tone: "violet" },
  { title: "Company Specific", sub: "Google, Microsoft, etc.", tone: "amber" },
  { title: "Coding Practice", sub: "LeetCode style", tone: "coral" },
];

export const IP_POPULAR_QUESTIONS: { text: string; category: string }[] = [
  { text: "Tell me about yourself.", category: "Behavioral" },
  { text: "Why do you want to work here?", category: "Behavioral" },
  { text: "Describe a challenging project you worked on.", category: "Behavioral" },
  { text: "How do you handle tight deadlines?", category: "Behavioral" },
  { text: "Explain a technical concept to a non-technical person.", category: "Technical" },
];

/** Extra rows for the Questions tab, beyond the five popular ones. */
export const IP_MORE_QUESTIONS: { text: string; category: string }[] = [
  { text: "Design a URL shortener.", category: "System Design" },
  { text: "How would you scale a read-heavy API?", category: "System Design" },
  { text: "Tell me about a time you disagreed with a teammate.", category: "Behavioral" },
  { text: "What is the difference between a process and a thread?", category: "Technical" },
  { text: "Reverse a linked list in place.", category: "Coding" },
  { text: "Why Google over other companies?", category: "Company Specific" },
];

export const IP_QUESTION_FILTERS = ["All", "Behavioral", "Technical", "System Design", "Coding", "Company Specific"];

export const IP_RECENT_SESSIONS = [
  { id: "s1", title: "Frontend Engineer", sub: "Google · Behavioral Questions", score: 85 },
  { id: "s2", title: "Software Engineer", sub: "System Design", score: 72 },
];

export const IP_PROGRESS = {
  pct: 70,
  stats: [
    { value: "12", label: "Mock Interviews" },
    { value: "48", label: "Questions practiced" },
    { value: "8", label: "Areas improved" },
  ],
};

export const IP_MOCK_TYPES: { title: string; sub: string; duration: string; tone: Tone }[] = [
  { title: "Recruiter Screen", sub: "Motivation, background and logistics", duration: "20 min", tone: "blue" },
  { title: "Technical Round", sub: "Coding and problem solving with an AI interviewer", duration: "45 min", tone: "violet" },
  { title: "System Design Round", sub: "Architecture trade-offs, whiteboard style", duration: "60 min", tone: "green" },
  { title: "Behavioral Round", sub: "Leadership and teamwork stories", duration: "30 min", tone: "amber" },
];

/* ── Explore (spec 2.11) ───────────────────────────────────────────────────────────── */

export const EX_TABS = [
  { id: "companies", label: "Companies" },
  { id: "roles", label: "Roles" },
  { id: "career-paths", label: "Career Paths" },
  { id: "resources", label: "Resources" },
];

export const EX_COMPANIES = [
  { name: "Google", jobs: 120 },
  { name: "Microsoft", jobs: 98 },
  { name: "Amazon", jobs: 134 },
  { name: "Meta", jobs: 76 },
  { name: "Apple", jobs: 64 },
  { name: "Netflix", jobs: 41 },
];

export const EX_ROLES = ["Software Engineer", "Frontend Developer", "Product Manager", "Data Scientist", "DevOps Engineer", "UX Designer"];

export const EX_PATHS: { title: string; steps: string[]; tone: Tone }[] = [
  { title: "Frontend track", steps: ["Frontend", "Full Stack", "Engineering Manager"], tone: "blue" },
  { title: "Data track", steps: ["Data Analyst", "Data Scientist", "ML Engineer"], tone: "violet" },
];

export const EX_RESOURCES = [
  { title: "Resume writing guide", sub: "Structure, keywords and ATS-safe formatting" },
  { title: "Interview question bank", sub: "Hundreds of real questions by role" },
  { title: "Salary negotiation 101", sub: "Know your worth and ask with confidence" },
  { title: "Networking playbook", sub: "Reach out to the right people the right way" },
];
