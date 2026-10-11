import type { ComponentType, ReactNode } from "react";
import {
  BriefcaseIcon,
  ChartIcon,
  ClipboardIcon,
  GraduationCapIcon,
  InboxIcon,
  LayoutGridIcon,
  MailIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
  ZapIcon,
  FileTextIcon,
  cn,
  type IconProps,
} from "@kiwiply/ui";
import { FAMILY, type Family } from "./family";
import { Container, SectionHeading, StatusChip } from "./parts";
import {
  AnalyticsMock,
  AutofillReviewMock,
  AutopilotBatchMock,
  ConsultantAccountsMock,
  ExpertServicesMock,
  InboxTrackingMock,
  JobBanksMock,
  MarketerMock,
  NotesMock,
  OutreachMock,
  ProfilesResumesMock,
  RolesMock,
} from "./feature-mocks";

/**
 * Block 2: "Everything you need". Twelve cards, each a mini mock, grouped Available now
 * first and Coming second. The split follows spec section 9 exactly, so nothing unbuilt reads
 * as shipped.
 */
interface Feature {
  title: string;
  body: string;
  Icon: ComponentType<IconProps>;
  family: Family;
  status: "now" | "coming";
  mock: ReactNode;
}

const FEATURES: Feature[] = [
  {
    title: "Consultant accounts",
    body: "A Kiwiply account for every consultant, on the plan you choose for each person.",
    Icon: UsersIcon,
    family: "blue",
    status: "now",
    mock: <ConsultantAccountsMock />,
  },
  {
    title: "Profiles & resumes",
    body: "Each consultant keeps their own profile and resume versions, built from the resume they upload.",
    Icon: FileTextIcon,
    family: "pink",
    status: "now",
    mock: <ProfilesResumesMock />,
  },
  {
    title: "Autofill they review",
    body: "Applications fill in the consultant's own browser. They check every field and submit.",
    Icon: ZapIcon,
    family: "amber",
    status: "now",
    mock: <AutofillReviewMock />,
  },
  {
    title: "Inbox tracking per consultant",
    body: "Each consultant connects their own Gmail. Replies and interview invites update their board.",
    Icon: MailIcon,
    family: "coral",
    status: "now",
    mock: <InboxTrackingMock />,
  },
  {
    title: "Role-based access",
    body: "Admins invite the team and assign or change plans. Reports are shared with consent.",
    Icon: ShieldCheckIcon,
    family: "green",
    status: "now",
    mock: <RolesMock />,
  },
  {
    title: "Notes & activity",
    body: "Keep notes and see a running timeline of activity for each consultant.",
    Icon: ClipboardIcon,
    family: "teal",
    status: "now",
    mock: <NotesMock />,
  },
  {
    title: "Expert services per person",
    body: "Add resume review, rewrite, mock interviews or coaching for any consultant, at standard prices.",
    Icon: GraduationCapIcon,
    family: "violet",
    status: "now",
    mock: <ExpertServicesMock />,
  },
  {
    title: "Marketer role",
    body: "Marketers prepare resumes, jobs and outreach for their consultants. They never submit or sign in as a consultant.",
    Icon: BriefcaseIcon,
    family: "violet",
    status: "coming",
    mock: <MarketerMock />,
  },
  {
    title: "Job banks per consultant",
    body: "A job list for each consultant, with the right resume paired to every job.",
    Icon: LayoutGridIcon,
    family: "pink",
    status: "coming",
    mock: <JobBanksMock />,
  },
  {
    title: "Recruiter outreach matching",
    body: "Recruiter mail is matched to the right consultant's board.",
    Icon: InboxIcon,
    family: "blue",
    status: "coming",
    mock: <OutreachMock />,
  },
  {
    title: "Analytics & reporting",
    body: "Applications, interviews and offers across your bench, shared with consent.",
    Icon: ChartIcon,
    family: "green",
    status: "coming",
    mock: <AnalyticsMock />,
  },
  {
    title: "Autopilot batches",
    body: "Prepare applications in bulk. Each one stops before submit, for the consultant to review.",
    Icon: SparklesIcon,
    family: "violet",
    status: "coming",
    mock: <AutopilotBatchMock />,
  },
];

function FeatureCard({ f }: { f: Feature }) {
  const fam = FAMILY[f.family];
  return (
    <li className="flex flex-col gap-4 rounded-[var(--radius-v2-card)] border border-v2-line/70 bg-white p-5 shadow-v2-card">
      <div className="flex items-start justify-between gap-3">
        <span aria-hidden className={cn("grid h-11 w-11 flex-none place-items-center rounded-xl", fam.soft)}>
          <f.Icon size={22} className={fam.icon} />
        </span>
        <StatusChip status={f.status} />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-[17px] leading-snug text-v2-navy">{f.title}</h3>
        <p className="text-sm leading-relaxed text-v2-ink-soft">{f.body}</p>
      </div>
      <div className="mt-auto">{f.mock}</div>
    </li>
  );
}

export default function OrgFeatures() {
  return (
    <section id="features" aria-labelledby="org-features-title" className="scroll-mt-24 py-16 md:py-24">
      <Container className="flex flex-col gap-10 md:gap-12">
        <SectionHeading
          id="org-features-title"
          eyebrow="Everything you need"
          family="lime"
          before="Everything you need to support your"
          accent="team's search."
          lede="Tools for the people who run the bench and the people on it. Some are live today; the rest are on the way, and each card says which."
        />
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} f={f} />
          ))}
        </ul>
        <p className="text-center text-[13px] text-v2-muted">
          Pictures on this page are examples with made-up names and numbers.
        </p>
      </Container>
    </section>
  );
}
