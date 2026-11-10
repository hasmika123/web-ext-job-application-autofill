import type { ComponentType } from "react";
import {
  ChartIcon,
  ChatIcon,
  FileTextIcon,
  GraduationCapIcon,
  PaperPlane,
  SearchIcon,
  TargetIcon,
  ZapIcon,
  cn,
  type IconProps,
} from "@kiwiply/ui";
import { FAMILY, type Family } from "../family";

/**
 * Landing-v3 pillars. Desktop board: six centred tiles in one row (AI Resume Builder ... Learn &
 * Grow). Phone board: four stacked cards under "Find jobs. Apply faster. Get hired." Two lists,
 * one shown per breakpoint (md+ / < md).
 */
type Pillar = { icon: ComponentType<IconProps>; family: Family; title: string; body: string };

const DESKTOP: Pillar[] = [
  { icon: FileTextIcon, family: "violet", title: "AI Resume Builder", body: "Create a modern, ATS-friendly resume in minutes." },
  { icon: SearchIcon, family: "blue", title: "Smart Job Matching", body: "Find roles that fit your skills, goals, and preferences." },
  { icon: PaperPlane as ComponentType<IconProps>, family: "green", title: "One-Click Apply", body: "Apply to multiple jobs automatically." },
  { icon: ChatIcon, family: "violet", title: "Interview Prep", body: "Get AI-powered practice and feedback." },
  { icon: ChartIcon, family: "amber", title: "Track Your Progress", body: "Stay organized and see real results." },
  { icon: GraduationCapIcon, family: "teal", title: "Learn & Grow", body: "Access curated resources to upskill and advance." },
];

const MOBILE: Pillar[] = [
  { icon: SearchIcon, family: "blue", title: "Find the right jobs", body: "Discover opportunities that match your skills, goals and vibe." },
  { icon: ZapIcon, family: "amber", title: "AI autofill applications", body: "Accurate, fast and tailored to each job." },
  { icon: FileTextIcon, family: "pink", title: "Smart resume selection", body: "Use the best resume automatically." },
  { icon: TargetIcon, family: "pink", title: "Track everything", body: "Keep all your applications, responses and interviews in one place." },
];

export default function V3Pillars() {
  return (
    <section id="pillars" aria-label="What Kiwiply does" className="px-5 pb-4 pt-2 md:pt-10 lg:px-8">
      {/* Desktop */}
      <ul className="mx-auto hidden max-w-[1440px] grid-cols-3 gap-x-6 gap-y-8 md:grid lg:grid-cols-6 lg:gap-x-4 lg:px-6">
        {DESKTOP.map((p) => {
          const f = FAMILY[p.family];
          return (
            <li key={p.title} className="flex flex-col items-center text-center">
              <span aria-hidden className={cn("grid h-[72px] w-[72px] place-items-center rounded-[20px]", f.soft, f.icon)}>
                <p.icon className="h-8 w-8" />
              </span>
              <h3 className="mt-4 text-[16px] font-bold tracking-normal text-v2-navy">{p.title}</h3>
              <p className="mt-1.5 max-w-[190px] text-[13.5px] leading-snug text-v2-ink-soft">{p.body}</p>
            </li>
          );
        })}
      </ul>

      {/* Phone */}
      <ul className="mx-auto flex max-w-md flex-col gap-3 md:hidden">
        {MOBILE.map((p) => {
          const f = FAMILY[p.family];
          return (
            <li
              key={p.title}
              className="flex flex-col items-center rounded-[20px] border border-v2-line/50 bg-white/70 px-6 py-6 text-center shadow-v2-card"
            >
              <span aria-hidden className={cn("grid h-14 w-14 place-items-center rounded-2xl", f.soft, f.icon)}>
                <p.icon className="h-7 w-7" />
              </span>
              <h3 className="mt-3 text-[17px] font-bold tracking-normal text-v2-navy">{p.title}</h3>
              <p className="mt-1.5 max-w-[240px] text-[14.5px] leading-snug text-v2-ink-soft">{p.body}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
