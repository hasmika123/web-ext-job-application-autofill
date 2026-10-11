import type { ComponentType, ReactNode } from "react";
import {
  BellIcon,
  CalendarIcon,
  ChartIcon,
  ClipboardIcon,
  FileTextIcon,
  MailIcon,
  SparklesIcon,
  StarIcon,
  UserIcon,
  UsersIcon,
  ZapIcon,
  ShieldCheckIcon,
  cn,
  type IconProps,
} from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";
import {
  AiMatchingMock,
  AlertsMock,
  AnalyticsMock,
  AutomationMock,
  EmailTrackingMock,
  EmployeeProfilesMock,
  InterviewTrackingMock,
  NotesMock,
  PermissionsMock,
  ResumeManagementMock,
  SupportCoachesMock,
  TeamManagementMock,
} from "./feature-mocks";
import SectionHeading from "../SectionHeading";
import { Container } from "./parts";

/** Block 2: "Everything you need to support your team's success." Twelve cards, as on the board. */
interface Feature {
  title: string;
  body: string;
  Icon: ComponentType<IconProps>;
  family: Family;
  mock: ReactNode;
}

const FEATURES: Feature[] = [
  {
    title: "Team management",
    body: "Organize employees, candidates, and support staff in one place.",
    Icon: StarIcon,
    family: "blue",
    mock: <TeamManagementMock />,
  },
  {
    title: "Employee profiles",
    body: "Centralize profiles, skills, goals, and job preferences.",
    Icon: UserIcon,
    family: "green",
    mock: <EmployeeProfilesMock />,
  },
  {
    title: "Resume management",
    body: "Store, edit, and manage multiple resume versions.",
    Icon: FileTextIcon,
    family: "blue",
    mock: <ResumeManagementMock />,
  },
  {
    title: "Assign support coaches",
    body: "Assign coaches or recruiters to provide personalised support.",
    Icon: UsersIcon,
    family: "violet",
    mock: <SupportCoachesMock />,
  },
  {
    title: "AI job matching",
    body: "Find relevant opportunities with AI-powered matching.",
    Icon: SparklesIcon,
    family: "violet",
    mock: <AiMatchingMock />,
  },
  {
    title: "Application automation",
    body: "Help your team apply faster with smart automation tools.",
    Icon: ZapIcon,
    family: "blue",
    mock: <AutomationMock />,
  },
  {
    title: "Email & response tracking",
    body: "Track outreach, responses, and follow-ups in one place.",
    Icon: MailIcon,
    family: "coral",
    mock: <EmailTrackingMock />,
  },
  {
    title: "Interview tracking",
    body: "Schedule, track, and manage interviews with reminders.",
    Icon: CalendarIcon,
    family: "blue",
    mock: <InterviewTrackingMock />,
  },
  {
    title: "Role-based permissions",
    body: "Control access with flexible team roles and permissions.",
    Icon: ShieldCheckIcon,
    family: "blue",
    mock: <PermissionsMock />,
  },
  {
    title: "Alerts & reminders",
    body: "Stay on top of important deadlines and next steps.",
    Icon: BellIcon,
    family: "amber",
    mock: <AlertsMock />,
  },
  {
    title: "Notes & activity timeline",
    body: "Keep all notes, updates, and activity in a shared timeline.",
    Icon: ClipboardIcon,
    family: "teal",
    mock: <NotesMock />,
  },
  {
    title: "Analytics & ROI reporting",
    body: "Track progress, measure outcomes, and demonstrate impact.",
    Icon: ChartIcon,
    family: "green",
    mock: <AnalyticsMock />,
  },
];

export default function OrgFeatures() {
  return (
    <section id="features" aria-labelledby="org-features-title" className="scroll-mt-20 py-12 md:py-20">
      <Container>
        <SectionHeading
          id="org-features-title"
          eyebrow="Enterprise Features"
          family="blue"
          title="Everything you need to support your"
          accent="team’s success."
          accentFamily="green"
          align="center"
          lede="Powerful tools to manage people, streamline job placement, and achieve better outcomes."
        />

        <ul className="mt-10 grid grid-cols-2 gap-3 md:mt-12 md:gap-5 lg:grid-cols-4">
          {FEATURES.map((f) => {
            const fam = FAMILY[f.family];
            return (
              <li
                key={f.title}
                className="flex flex-col gap-3 rounded-[var(--radius-v2-card)] border border-white/70 bg-white p-4 shadow-v2-card md:p-5"
              >
                <div className="flex items-start gap-3">
                  <span className={cn("grid h-11 w-11 flex-none place-items-center rounded-xl", fam.soft, fam.icon)}>
                    <f.Icon className="h-5 w-5" />
                  </span>
                  <div aria-hidden className="hidden min-h-[88px] min-w-0 flex-1 items-center justify-end md:flex">
                    <div className="w-full max-w-[190px]">{f.mock}</div>
                  </div>
                </div>
                <div className="mt-auto flex flex-col gap-1.5 md:pt-2">
                  <h3 className="text-[15px] font-bold leading-snug tracking-normal text-v2-navy md:text-base">{f.title}</h3>
                  <p className="text-[13px] leading-relaxed text-v2-ink-soft md:text-[14px]">{f.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
