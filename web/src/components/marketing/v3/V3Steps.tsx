import type { ComponentType } from "react";
import { ArrowRightIcon, BriefcaseIcon, FileTextIcon, PaperPlane, SearchIcon, ZapIcon, cn, type IconProps } from "@kiwiply/ui";
import Eyebrow from "../Eyebrow";
import { FAMILY, type Family } from "../family";

/**
 * "How it works - Get Hired in 4 Simple Steps" (desktop board: heading only; the four step cards
 * are not drawn, so their copy follows the product: Kiwiply prepares, the person reviews and
 * submits). Anchor `#steps` is where "Watch Video" and "See How It Works" land.
 */
const STEPS: { icon: ComponentType<IconProps>; family: Family; title: string; body: string }[] = [
  { icon: FileTextIcon, family: "violet", title: "Build your profile", body: "Upload your resume once and Kiwiply builds your profile from it." },
  { icon: SearchIcon, family: "blue", title: "Find matching jobs", body: "See roles that fit your skills, goals and preferences." },
  { icon: ZapIcon, family: "amber", title: "Apply with AI", body: "We autofill and tailor each application. You review and submit." },
  { icon: BriefcaseIcon, family: "green", title: "Track and get hired", body: "Follow every response, prepare for interviews and land the job." },
];

export default function V3Steps() {
  return (
    <section id="steps" aria-labelledby="v3-steps-title" className="relative scroll-mt-20 overflow-x-clip px-5 pb-16 pt-14 lg:px-8 lg:pb-20 lg:pt-16">
      <div className="mx-auto max-w-[1100px]">
        <div className="relative flex flex-col items-center text-center">
          <Eyebrow family="blue" className="bg-white px-4 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.12em] shadow-sm">
            How it works
          </Eyebrow>
          <h2 id="v3-steps-title" className="mt-4 text-[30px] text-v2-navy md:text-[38px]">
            Get Hired in <span className="text-v2-green">4 Simple Steps</span>
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-v2-ink-soft md:text-[16px]">
            Everything you need, from search to offer, in one seamless experience.
          </p>
          <PaperPlane aria-hidden className="absolute -top-2 right-0 hidden h-10 w-12 text-v2-blue md:block" />
        </div>

        <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4 lg:gap-3">
          {STEPS.map((s, i) => {
            const f = FAMILY[s.family];
            return (
              <li key={s.title} className="relative">
                <div className="flex h-full items-start gap-4 rounded-[20px] border border-v2-line/60 bg-white p-5 shadow-v2-card lg:flex-col lg:items-center lg:text-center">
                  <span aria-hidden className={cn("grid h-14 w-14 flex-none place-items-center rounded-full", f.soft, f.icon)}>
                    <s.icon className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-wide text-v2-muted">Step {i + 1}</p>
                    <h3 className="mt-0.5 text-[16px] font-bold tracking-normal text-v2-navy">{s.title}</h3>
                    <p className="mt-1.5 text-[13.5px] leading-snug text-v2-ink-soft">{s.body}</p>
                  </div>
                </div>
                {i < STEPS.length - 1 ? (
                  <span aria-hidden className="absolute -right-[18px] top-1/2 z-10 hidden -translate-y-1/2 text-v2-teal lg:block">
                    <ArrowRightIcon size={18} />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
