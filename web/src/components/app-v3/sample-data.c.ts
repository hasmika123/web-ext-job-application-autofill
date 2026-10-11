/**
 * SAMPLE — board data, not from the API; replace when the feature ships.
 *
 * V3-C sample data (APP-V3-SPEC sections 2.5, 2.6, 2.9): AI Assistant, Job Alerts and Messages.
 * The V3-QA phase merges the per-phase `sample-data.<phase>.ts` files into one `sample-data.ts`.
 */
import type { Tone } from "../app-v2/common";

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
