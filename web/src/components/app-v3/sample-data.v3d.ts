/**
 * SAMPLE — board data, not from the API; replace when the feature ships.
 * Phase V3-D (Resume Builder, Interview Prep, Explore, Analytics). QA merges this into the one
 * `app-v3/sample-data.ts`. (Named `.v3d.ts`, not `.d.ts`: a `.d.ts` file cannot hold values.)
 */
import type { Tone } from "@/components/app-v2/common";

/* ── Resume Builder (spec 2.7) ─────────────────────────────────────────────────────── */

export const RB_TABS = [
  { id: "builder", label: "Builder" },
  { id: "templates", label: "Templates" },
  { id: "ai-suggestions", label: "AI Suggestions" },
  { id: "cover-letter", label: "Cover Letter" },
];

export const RB_SECTIONS = [
  "Personal Info",
  "Professional Summary",
  "Work Experience",
  "Education",
  "Skills",
  "Projects",
  "Certifications",
  "Achievements",
];

export const RB_DEFAULT_SECTION = "Professional Summary";

export const RB_SECTION_TEXT: Record<string, string> = {
  "Personal Info": "Priya Sharma\nSoftware Engineer\nSan Francisco, CA  |  priya@email.com  |  linkedin.com/in/priya",
  "Professional Summary":
    "Results-driven Software Engineer with 5+ years of experience building scalable web applications using React, Node.js, and cloud technologies. Passionate about creating intuitive user experiences and solving complex problems.",
  "Work Experience":
    "Senior Software Engineer, Northwind Labs (2022 - Present)\n- Led a team of four engineers to rebuild the checkout flow in React, cutting load time by 38%.\n- Designed Node.js services handling 2M requests a day on AWS.\n\nSoftware Engineer, Brightpath (2020 - 2022)\n- Shipped a customer dashboard used by 15,000 accounts.",
  Education: "B.S. in Computer Science, University of California, Davis (2016 - 2020)",
  Skills: "React, TypeScript, Next.js, Node.js, AWS, PostgreSQL, GraphQL, System Design",
  Projects: "Open-source component library (2.1k GitHub stars)\nPersonal finance tracker built with Next.js and Plaid",
  Certifications: "AWS Certified Developer - Associate (2024)",
  Achievements: "Engineering Excellence Award, Northwind Labs (2024)\nSpeaker at ReactConf Local (2023)",
};

export const RB_EXAMPLES: { role: string; text: string }[] = [
  {
    role: "Software Engineer",
    text: "Results-driven Software Engineer with 5+ years of experience building scalable web applications using React, Node.js, and cloud technologies. Passionate about creating intuitive user experiences and solving complex problems.",
  },
  {
    role: "Frontend Developer",
    text: "Frontend Developer with 4+ years of experience crafting fast, accessible interfaces in React and TypeScript. Obsessed with design systems, performance budgets and pixel-level polish.",
  },
  {
    role: "Full Stack Developer",
    text: "Full Stack Developer with 5+ years of experience shipping end-to-end features across React, Node.js and PostgreSQL. Comfortable owning a project from database schema to deployed UI.",
  },
  {
    role: "Product Engineer",
    text: "Product-minded engineer with 5+ years of experience turning customer problems into shipped features. Works closely with design and data to measure what matters and iterate quickly.",
  },
];

export const RB_TEMPLATES = ["Modern", "Classic", "Professional", "Minimal", "Creative"];

export const RB_AI_SUGGESTIONS: { title: string; sub: string; tone: Tone }[] = [
  { title: "Make it 30% stronger", sub: "Tighten wording and lead with impact", tone: "violet" },
  { title: "Tailor for this job", sub: "Match keywords from a job description", tone: "blue" },
  { title: "Improve bullet points", sub: "Add action verbs and measurable results", tone: "green" },
  { title: "Fix grammar & tone", sub: "Catch typos and keep a confident voice", tone: "amber" },
];

/** Shown only while the account has no resumes yet. */
export const RB_SAMPLE_VERSIONS = [
  { id: -1, label: "Software Engineer Resume", date: "Oct 5, 2026", version: 3, isDefault: true },
  { id: -2, label: "Frontend Developer Resume", date: "Sep 28, 2026", version: 2, isDefault: false },
  { id: -3, label: "Product Manager Resume", date: "Sep 12, 2026", version: 1, isDefault: false },
];

export const RB_COVER_LETTER =
  "Dear Hiring Manager,\n\nI am excited to apply for the Software Engineer role. Over the past five years I have built and shipped scalable web applications with React, Node.js and AWS, and I would love to bring that experience to your team.\n\nThank you for your time and consideration.\n\nSincerely,\nPriya Sharma";

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

/* ── Analytics (spec 2.12) ─────────────────────────────────────────────────────────── */

export const AN_TABS = [
  { id: "overview", label: "Overview" },
  { id: "applications", label: "Applications" },
  { id: "interviews", label: "Interviews" },
  { id: "offers", label: "Offers" },
];

export interface AnalyticsData {
  /** True when computed from the signed-in user's own applications. */
  real: boolean;
  stats: {
    applications: { value: string; delta?: { value: string; up: boolean } };
    interviews: { value: string; delta?: { value: string; up: boolean } };
    offers: { value: string; delta?: { value: string; up: boolean } };
    response: { value: string; delta?: { value: string; up: boolean } };
  };
  overTime: { label: string; values: number[] }[];
  responseByCompany: { name: string; pct: number }[];
  status: { label: string; value: number; tone: Tone }[];
}

export const AN_SAMPLE: AnalyticsData = {
  real: false,
  stats: {
    applications: { value: "42", delta: { value: "12%", up: true } },
    interviews: { value: "8", delta: { value: "3", up: true } },
    offers: { value: "5", delta: { value: "1", up: true } },
    response: { value: "19%", delta: { value: "4%", up: true } },
  },
  overTime: [
    { label: "Sep 10", values: [18, 6, 2] },
    { label: "Sep 17", values: [22, 7, 3] },
    { label: "Sep 24", values: [15, 5, 1] },
    { label: "Oct 1", values: [26, 9, 4] },
    { label: "Oct 8", values: [30, 10, 5] },
  ],
  responseByCompany: [
    { name: "Google", pct: 60 },
    { name: "Microsoft", pct: 45 },
    { name: "Amazon", pct: 40 },
    { name: "Meta", pct: 25 },
    { name: "Airbnb", pct: 50 },
  ],
  status: [
    { label: "Applied", value: 18, tone: "blue" },
    { label: "Under Review", value: 10, tone: "amber" },
    { label: "Interview", value: 8, tone: "green" },
    { label: "Offer", value: 5, tone: "violet" },
    { label: "Rejected", value: 1, tone: "coral" },
  ],
};

export const AN_SKILLS = [
  { name: "React", pct: 92 },
  { name: "TypeScript", pct: 88 },
  { name: "Node.js", pct: 76 },
  { name: "AWS", pct: 64 },
  { name: "Python", pct: 58 },
];
