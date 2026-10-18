import { BriefcaseIcon, ClipboardIcon, CurvedArrow, HeartIcon, MailIcon, cn } from "@kiwiply/ui";
import Eyebrow from "../Eyebrow";
import { FAMILY } from "../family";
import Handwritten from "../Handwritten";
import { Photo } from "../media";
import ScaledCanvas from "../ScaledCanvas";
import Section from "../Section";
import { IconTile } from "./shared";

const APPLICATIONS = [
  { role: "Design Intern", meta: "Applied • 3d ago", family: "violet", icon: ClipboardIcon },
  { role: "Marketing Associate", meta: "Applied • 4d ago", family: "coral", icon: BriefcaseIcon },
] as const;

function ApplicationsCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-[var(--radius-v2-card)] bg-white p-3 shadow-v2-float", className)}>
      <p className="text-[13px] font-bold text-v2-navy">Applications</p>
      <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-2">
        {APPLICATIONS.map(({ role, meta, family, icon: Icon }) => (
          <li key={role} className="flex items-center gap-2.5 rounded-xl border border-v2-line/70 p-2">
            <IconTile family={family} className="h-8 w-8 rounded-lg">
              <Icon size={16} />
            </IconTile>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-bold leading-tight text-v2-navy">{role}</p>
              <p className="text-[11px] text-v2-muted">{meta}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessageCard({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-[var(--radius-v2-card)] bg-v2-green-soft p-3 shadow-v2-float", className)}>
      <IconTile family="green" className="h-9 w-9 flex-none rounded-lg bg-white">
        <MailIcon size={18} />
      </IconTile>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-v2-ink-soft">New message</p>
        <p className="text-[13px] font-bold leading-tight text-v2-navy">Interview invitation!</p>
        <p className="text-[11px] text-v2-muted">Acme Corp &bull; 2h ago</p>
      </div>
    </div>
  );
}

/** "Why we built Kiwiply" (`#mission`): photo with two floating cards left; copy + quote card right. */
export default function Mission() {
  return (
    <Section id="mission" labelledBy="mission-title" className="pb-10 pt-16 lg:pb-14 lg:pt-20">
      <div className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8 lg:gap-14">
        {/* art, mobile (< md): panel with the woman bottom-left, Applications card behind her shoulder
            (top-right); the message card sits under the panel so it never covers her. */}
        <div className="mx-auto w-full max-w-[560px] md:hidden">
          <div className="relative h-[300px] sm:h-[340px]">
            <div aria-hidden className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-v2-blue-soft via-white to-v2-lime-soft" />
            <Handwritten family="violet" className="absolute left-4 top-4 z-[1] w-[110px] -rotate-6 text-[22px] sm:w-36 sm:text-[26px]">
              From searching to thriving
            </Handwritten>
            <ApplicationsCard className="absolute right-3 top-4 z-10 w-[190px] sm:w-[236px]" />
            <div className="absolute bottom-0 left-2 z-20 w-[72%] sm:w-[62%]">
              <Photo
                id="hero-student"
                alt="A job seeker smiling at her laptop"
                className="w-full"
                sizes="(min-width: 640px) 350px, 72vw"
              />
            </div>
          </div>
          <MessageCard className="ml-auto mt-3 w-[230px]" />
        </div>

        {/* art, md and up: one fixed composition scaled to its column (`ScaledCanvas`). Stacking:
            wash (0) < Applications / message cards (10) < woman + the mascot baked into her cutout (20).
            Woman bottom-left, Applications card top-right, message card bottom-right, handwriting
            top-left; no cutout is clipped and no card touches her. */}
        <div className="relative hidden w-full max-w-[560px] md:block md:max-w-none">
          <ScaledCanvas width={520} height={360} className="md:max-w-[560px]">
            <div aria-hidden className="absolute inset-0 z-0 rounded-[32px] bg-gradient-to-br from-v2-blue-soft via-white to-v2-lime-soft" />
            <Handwritten family="violet" className="absolute left-6 top-5 z-[1] w-36 -rotate-6 text-[26px]">
              From searching to thriving
            </Handwritten>
            <CurvedArrow direction="down-right" className="absolute left-5 top-[104px] z-[1] h-8 w-8 text-v2-green" />
            <ApplicationsCard className="absolute right-3.5 top-6 z-10 w-[236px]" />
            <MessageCard className="absolute bottom-6 right-3 z-10 w-[190px]" />
            <div className="absolute bottom-0 left-2.5 z-20 w-[290px]">
              <Photo
                id="hero-student"
                alt="A job seeker smiling at her laptop"
                className="w-full"
                sizes="(min-width: 1024px) 320px, 40vw"
              />
            </div>
          </ScaledCanvas>
        </div>

        {/* copy */}
        <div>
          <Eyebrow family="green">Our Why</Eyebrow>
          <h2 id="mission-title" className="mt-4 text-[28px] text-v2-navy md:text-[clamp(24px,3.2vw,40px)]">
            Why we built <span className={cn(FAMILY.green.headline)}>Kiwiply</span>
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-v2-ink-soft md:text-[clamp(14px,1.4vw,17px)]">
            Job searching is full of friction &mdash; too many tabs, repetitive forms, uncertain follow-ups,
            and missed opportunities. We built Kiwiply to change that. By combining AI with a human-centered
            design, we make it easier to find better-fit opportunities, simplify applications, track your
            progress, and help you stay organized from search to offer.
          </p>
          <blockquote className="mt-6 flex max-w-xl items-center gap-4 rounded-[var(--radius-v2-card)] bg-v2-blue-soft px-5 py-4">
            <HeartIcon aria-hidden size={30} className="flex-none text-v2-blue" fill="currentColor" />
            <p className="text-base leading-snug text-v2-ink-soft md:text-[17px]">
              Because everyone deserves a fair shot at a career they&rsquo;re excited about.
            </p>
          </blockquote>
        </div>
      </div>
    </Section>
  );
}
