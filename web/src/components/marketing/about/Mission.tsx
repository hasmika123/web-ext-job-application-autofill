import { BriefcaseIcon, ClipboardIcon, CurvedArrow, HeartIcon, MailIcon, cn } from "@kiwiply/ui";
import Eyebrow from "../Eyebrow";
import { FAMILY } from "../family";
import Handwritten from "../Handwritten";
import { Photo } from "../media";
import Section from "../Section";
import { IconTile } from "./shared";

const APPLICATIONS = [
  { role: "Design Intern", meta: "Applied • 3d ago", family: "violet", icon: ClipboardIcon },
  { role: "Marketing Associate", meta: "Applied • 4d ago", family: "coral", icon: BriefcaseIcon },
] as const;

/** "Why we built Kiwiply" (`#mission`): photo with two floating cards left; copy + quote card right. */
export default function Mission() {
  return (
    <Section id="mission" labelledBy="mission-title" className="pb-10 pt-16 lg:pb-14 lg:pt-20">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
        {/* art */}
        <div className="relative mx-auto w-full max-w-[560px] lg:max-w-none">
          <div className="relative h-[320px] overflow-hidden rounded-[28px] bg-gradient-to-br from-v2-blue-soft via-white to-v2-lime-soft sm:h-[380px] lg:rounded-[32px]">
            <div className="absolute bottom-0 left-4 w-[56%] lg:left-6 lg:w-[54%]">
              <Photo
                id="hero-student"
                alt="A job seeker smiling at her laptop"
                className="w-full"
                sizes="(min-width: 1024px) 320px, 56vw"
              />
            </div>

            <Handwritten family="violet" className="absolute left-4 top-4 w-36 -rotate-6 text-[26px] lg:left-6 lg:top-6">
              From searching to thriving
            </Handwritten>
            <CurvedArrow
              direction="down-right"
              className="absolute left-5 top-[34%] hidden h-8 w-8 text-v2-green sm:block"
            />

            {/* Applications card */}
            <div className="absolute right-3 top-4 z-10 w-[190px] rounded-[var(--radius-v2-card)] bg-white p-3 shadow-v2-float sm:w-[220px] lg:right-5 lg:top-6">
              <p className="text-[13px] font-bold text-v2-navy">Applications</p>
              <ul className="mt-2 grid gap-2">
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

            {/* New message card */}
            <div className="absolute bottom-5 right-3 z-10 flex w-[200px] items-center gap-3 rounded-[var(--radius-v2-card)] bg-v2-green-soft p-3 shadow-v2-float sm:w-[230px] lg:bottom-7 lg:right-5">
              <IconTile family="green" className="h-9 w-9 rounded-lg bg-white">
                <MailIcon size={18} />
              </IconTile>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-v2-ink-soft">New message</p>
                <p className="text-[13px] font-bold leading-tight text-v2-navy">Interview invitation!</p>
                <p className="text-[11px] text-v2-muted">Acme Corp &bull; 2h ago</p>
              </div>
            </div>
          </div>
        </div>

        {/* copy */}
        <div>
          <Eyebrow family="green">Our Why</Eyebrow>
          <h2 id="mission-title" className="mt-4 text-[28px] text-v2-navy md:text-4xl lg:text-[40px]">
            Why we built <span className={cn(FAMILY.green.headline)}>Kiwiply</span>
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-v2-ink-soft md:text-[17px]">
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
