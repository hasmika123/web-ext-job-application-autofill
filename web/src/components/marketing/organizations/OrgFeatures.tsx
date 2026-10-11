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
    family: "violet",
    mock: <ResumeManagementMock />,
  },
  {
    title: "Assign support coaches",
    body: "Assign coaches or recruiters to provide personalised support.",
    Icon: UsersIcon,
    family: "amber",
    mock: <SupportCoachesMock />,
  },
  {
    title: "AI job matching",
    body: "Find relevant opportunities with AI-powered matching.",
    Icon: SparklesIcon,
    family: "pink",
    mock: <AiMatchingMock />,
  },
  {
    title: "Application automation",
    body: "Help your team apply faster with smart automation tools.",
    Icon: ZapIcon,
    family: "teal",
    mock: <AutomationMock />,
  },
  {
    title: "Email & response tracking",
    body: "Track outreach, responses, and follow-ups in one place.",
    Icon: MailIcon,
    family: "blue",
    mock: <EmailTrackingMock />,
  },
  {
    title: "Interview tracking",
    body: "Schedule, track, and manage interviews with reminders.",
    Icon: CalendarIcon,
    family: "green",
    mock: <InterviewTrackingMock />,
  },
  {
    title: "Role-based permissions",
    body: "Control access with flexible team roles and permissions.",
    Icon: ShieldCheckIcon,
    family: "violet",
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
    family: "pink",
    mock: <NotesMock />,
  },
  {
    title: "Analytics & ROI reporting",
    body: "Track progress, measure outcomes, and demonstrate impact.",
    Icon: ChartIcon,
    family: "teal",
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
          className="[&_h2]:max-w-6xl [&_h2]:text-balance"
          lede="Powerful tools to manage people, streamline job placement, and achieve better outcomes."
        />

        <ul className="mt-10 grid grid-cols-1 items-stretch gap-4 md:mt-12 md:grid-cols-2 md:gap-5 lg:grid-cols-4">
          {FEATURES.map((f) => {
            const fam = FAMILY[f.family];
            return (
              <li
                key={f.title}
                className="group flex flex-col gap-3 rounded-2xl border border-v2-line/50 bg-white p-5 shadow-v2-card transition duration-200 hover:-translate-y-0.5 hover:shadow-v2-float motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <div className="flex items-start gap-3">
                  <span className={cn("grid h-12 w-12 flex-none place-items-center rounded-xl", fam.soft, fam.icon)}>
                    <f.Icon className="h-5 w-5" />
                  </span>
                  <div aria-hidden className="flex min-h-0 min-w-0 flex-1 items-start justify-end md:min-h-[124px]">
                    <div className="w-full max-w-[160px]">{f.mock}</div>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 ">
                  <h3 className="text-[16px] font-bold leading-snug tracking-normal text-v2-navy">{f.title}</h3>
                  <p className="text-[14px] leading-relaxed text-v2-ink-soft">{f.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
