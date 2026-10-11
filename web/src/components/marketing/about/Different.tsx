import type { ComponentType, ReactNode } from "react";
import {
  BellIcon,
  BriefcaseIcon,
  CheckIcon,
  ChatIcon,
  ClipboardIcon,
  EyeIcon,
  FileTextIcon,
  LayoutGridIcon,
  LayersIcon,
  MailIcon,
  TargetIcon,
  TrendingUpIcon,
  UserIcon,
  cn,
  type IconProps,
} from "@kiwiply/ui";
import Handwritten from "../Handwritten";
import { Mascot, Photo } from "../media";
import Section from "../Section";
import { IconTile, RowHeading, type Family } from "./shared";

/* ── Tiny pure-HTML product mocks (fictional sample data, as on the board) ───────────── */

function MockFrame({ children, tint }: { children: ReactNode; tint: string }) {
  return (
    <div aria-hidden className={cn("relative hidden h-44 w-full overflow-hidden rounded-2xl p-3 md:block", tint)}>
      {children}
    </div>
  );
}

function Bar({ w, className }: { w: string; className?: string }) {
  return <span className={cn("block h-1.5 rounded-full bg-v2-line", w, className)} />;
}

function MockAutofill() {
  return (
    <MockFrame tint="bg-gradient-to-br from-v2-green-soft via-white to-v2-lime-soft">
      <div className="mx-auto mt-1 grid w-[88%] gap-2 rounded-xl bg-white p-3 shadow-v2-card">
        {["w-3/5", "w-4/5"].map((fill) => (
          <span key={fill} className="grid gap-1">
            <Bar w="w-1/3" />
            <span className="flex h-6 items-center rounded-md border border-v2-line bg-v2-lime-soft/50 px-2">
              <Bar w={fill} className="bg-v2-navy/25" />
            </span>
          </span>
        ))}
      </div>
      <span className="absolute inset-x-0 bottom-3.5 mx-auto grid h-8 w-[58%] place-items-center rounded-full bg-v2-lime text-[11px] font-bold text-v2-navy shadow-v2-card">
        Auto Apply
      </span>
    </MockFrame>
  );
}

function MockResume() {
  return (
    <MockFrame tint="bg-gradient-to-br from-v2-blue-soft via-white to-v2-violet-soft">
      <div className="mx-auto mt-1 grid w-[84%] gap-1.5 rounded-lg bg-white p-3 shadow-v2-card">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-v2-navy">Design</span>
          <span className="grid h-6 w-6 place-items-center rounded-full bg-v2-amber-soft text-v2-amber">
            <UserIcon size={14} />
          </span>
        </div>
        <Bar w="w-full" />
        <Bar w="w-5/6" />
        <Bar w="w-2/3" />
        <Bar w="w-3/4" />
      </div>
      <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-lg bg-v2-green-soft px-2 py-1.5 text-[10px] font-semibold text-v2-navy shadow-v2-card">
        <CheckIcon size={11} className="text-v2-green" />
        Tailored for this job
      </span>
    </MockFrame>
  );
}

function MockInbox() {
  const rows: Array<[string, string, Family, ComponentType<IconProps>]> = [
    ["Interview invitation", "Acme Corp • 2h ago", "coral", MailIcon],
    ["Application viewed", "3h ago", "blue", EyeIcon],
    ["New job match", "1d ago", "violet", BriefcaseIcon],
  ];
  return (
    <MockFrame tint="bg-gradient-to-br from-v2-teal-soft via-white to-v2-green-soft">
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
        {rows.map(([t, meta, family, Icon]) => (
          <li key={t} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 shadow-v2-card">
            <IconTile family={family} className="h-7 w-7 rounded-full">
              <Icon size={13} />
            </IconTile>
            <span className="min-w-0">
              <span className="block truncate text-[10px] font-bold leading-tight text-v2-navy">{t}</span>
              <span className="block text-[9px] text-v2-muted">{meta}</span>
            </span>
          </li>
        ))}
      </ul>
    </MockFrame>
  );
}

function MockMatches() {
  const rows: Array<[string, string, Family, ComponentType<IconProps>]> = [
    ["Product Designer", "96% match", "green", ClipboardIcon],
    ["Marketing Associate", "92% match", "violet", TargetIcon],
    ["Operations Coordinator", "88% match", "amber", BriefcaseIcon],
  ];
  return (
    <MockFrame tint="bg-gradient-to-br from-v2-lime-soft via-white to-v2-green-soft">
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
        {rows.map(([t, pct, family, Icon]) => (
          <li key={t} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 shadow-v2-card">
            <IconTile family={family} className="h-7 w-7 rounded-lg">
              <Icon size={13} />
            </IconTile>
            <span className="min-w-0">
              <span className="block truncate text-[10px] font-bold leading-tight text-v2-navy">{t}</span>
              <span className="block text-[9px] font-semibold text-v2-green">{pct}</span>
            </span>
          </li>
        ))}
      </ul>
    </MockFrame>
  );
}

function MockInterview() {
  const rows = ["Practice questions", "AI feedback", "Build confidence"];
  return (
    <MockFrame tint="bg-gradient-to-br from-v2-teal-soft via-white to-v2-blue-soft">
      {/* Bottom-flush and capped at 112px wide (<= ~130px tall) so the head is never cut by the
          frame's h-44; the card (in front, as on the board) is short enough to stay under her chin. */}
      <div className="absolute bottom-0 left-0 z-10 w-[min(60%,112px)]">
        <Photo id="hero-copilot" alt="" className="w-full" sizes="140px" />
      </div>
      <ul className="absolute bottom-3 right-3 z-20 grid w-[72%] gap-1 rounded-lg bg-white p-1.5 shadow-v2-card">
        {rows.map((t) => (
          <li key={t} className="flex items-center gap-1.5 text-[10px] font-semibold leading-tight text-v2-navy">
            <CheckIcon size={11} className="flex-none text-v2-green" />
            {t}
          </li>
        ))}
      </ul>
    </MockFrame>
  );
}

function MockDashboard() {
  const rows: Array<[string, string, string]> = [
    ["Interview", "3", "bg-v2-amber"],
    ["In Review", "5", "bg-v2-blue"],
    ["Applied", "16", "bg-v2-violet"],
  ];
  return (
    <MockFrame tint="bg-gradient-to-br from-v2-green-soft via-white to-v2-blue-soft">
      <div className="mx-auto grid w-[90%] gap-1.5 rounded-xl bg-white p-3 shadow-v2-card">
        <div className="flex items-center justify-between">
          <div>
            <span className="block text-[10px] font-semibold text-v2-navy">Applications</span>
            <span className="block text-[22px] font-extrabold leading-none text-v2-navy">24</span>
          </div>
          <TrendingUpIcon size={36} className="text-v2-blue" />
        </div>
        {rows.map(([label, n, dot]) => (
          <div key={label} className="flex items-center gap-1.5 text-[9.5px] font-semibold text-v2-ink-soft">
            <span className={cn("h-2.5 w-2.5 rounded-full", dot)} />
            <span className="flex-1">{label}</span>
            <span className="text-v2-navy">{n}</span>
          </div>
        ))}
      </div>
    </MockFrame>
  );
}

const TOOLS: Array<{
  title: string;
  body: string;
  family: Family;
  icon: ComponentType<IconProps>;
  mock: ReactNode;
}> = [
  {
    title: "AI Autofill Applications",
    body: "Save hours with AI that fills out applications for you.",
    family: "blue",
    icon: FileTextIcon,
    mock: <MockAutofill />,
  },
  {
    title: "Smart Resume Tailoring",
    body: "Create polished, targeted resumes in seconds.",
    family: "green",
    icon: LayersIcon,
    mock: <MockResume />,
  },
  {
    title: "Email Tracking & Alerts",
    body: "Never miss an update with real-time notifications.",
    family: "pink",
    icon: BellIcon,
    mock: <MockInbox />,
  },
  {
    title: "Job Match Discovery",
    body: "Find opportunities that fit your skills, goals, and interests.",
    family: "violet",
    icon: TargetIcon,
    mock: <MockMatches />,
  },
  {
    title: "Interview Readiness",
    body: "Prepare with personalized tips and practice tools.",
    family: "teal",
    icon: ChatIcon,
    mock: <MockInterview />,
  },
  {
    title: "All-in-One Dashboard",
    body: "Stay organized and track your entire journey in one place.",
    family: "amber",
    icon: LayoutGridIcon,
    mock: <MockDashboard />,
  },
];

/** "Powerful tools for a simpler, smarter job search." Six cards with mini mocks (icon rows on mobile). */
export default function Different() {
  return (
    <Section labelledBy="different-title" className="py-10 lg:py-14">
      <div className="relative">
        <RowHeading
          id="different-title"
          eyebrow="What Makes Kiwiply Different"
          title="Powerful tools for a"
          accent="simpler, smarter job search."
          className="pr-24 md:pr-32 xl:pr-0"
        >
          <div aria-hidden className="relative hidden items-center gap-1 xl:flex">
            <Handwritten family="violet" className="w-36 -rotate-3 text-[24px]">
              Less effort. More opportunity.
            </Handwritten>
            <Mascot pose="headphones" className="-my-6 h-20 w-20" />
          </div>
        </RowHeading>
        {/* Below xl: handwriting top-right, mascot beside the heading (mobile board). */}
        <Handwritten
          family="violet"
          className="absolute right-0 top-0 hidden w-36 -rotate-3 text-right text-[20px] sm:block lg:hidden"
        >
          Less effort, more opportunity!
        </Handwritten>
        <Mascot pose="headphones" className="absolute right-0 top-11 h-20 w-20 md:h-24 md:w-24 xl:hidden" />
      </div>

      <div className="mt-8 rounded-[28px] bg-white/70 p-3 shadow-v2-card lg:mt-10 lg:p-4">
        <ul className="grid gap-3 md:grid-cols-3 xl:grid-cols-6 lg:gap-4">
          {TOOLS.map((t) => (
            <li
              key={t.title}
              className="flex flex-row items-start gap-4 rounded-[var(--radius-v2-card)] bg-white p-4 md:flex-col md:gap-3 md:bg-transparent md:p-2"
            >
              {t.mock}
              <IconTile family={t.family} className="md:hidden">
                <t.icon size={24} />
              </IconTile>
              <div>
                <h3 className="text-[16px] font-bold leading-snug tracking-normal text-v2-navy">{t.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-v2-ink-soft">{t.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
