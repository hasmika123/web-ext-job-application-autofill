import Link from "next/link";
import { ArrowRightIcon, CurvedArrow, PlayIcon, SparkBurst, cn } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui";
import { contactHref } from "@/lib/catalog";
import { DEMO_VIDEO_URL } from "@/lib/site";
import { FAMILY, HEADLINE_GREEN } from "./family";
import { Mascot, Photo } from "../media";
import OrgStatsMock from "./OrgStatsMock";
import { Container, Eyebrow, Handwritten } from "./parts";
import { MOBILE_STRIP } from "./placeholder-data";

/** "Watch Overview" opens the demo video when there is one, otherwise jumps to How It Works. */
const OVERVIEW_HREF = DEMO_VIDEO_URL ?? "#how";

/** Block 1: hero. Copy left; overview card, team photo, mascot and a handwritten note right. */
export default function OrgHero() {
  return (
    <>
      <section aria-labelledby="org-hero-title" className="relative overflow-hidden pb-6 pt-10 md:pb-16 md:pt-14">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-v2-lime/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-v2-blue/20 blur-3xl" />

        <Container className="relative grid items-center gap-10 lg:grid-cols-[0.9fr_1.2fr] lg:gap-6">
          <div className="relative flex flex-col items-start gap-6">
            <Eyebrow family="teal">For Organizations</Eyebrow>
            <h1 id="org-hero-title" className="text-[36px] leading-[1.04] text-v2-navy md:text-[44px] lg:text-[56px] xl:text-[60px]">
              Support employee
              <br />
              <span className={HEADLINE_GREEN}>job placement</span>
              <br />
              at scale.
            </h1>
            <SparkBurst
              aria-hidden
              className="absolute right-0 top-[8.5rem] hidden h-8 w-8 text-v2-lime-deep lg:block"
            />
            <p className="max-w-[500px] text-base leading-relaxed text-v2-ink-soft md:text-lg">
              Manage your team&apos;s job search, assign support, track progress, and improve outcomes with AI-powered
              tools — all in one place.
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-5">
              <Link href={contactHref("organization")} className={buttonVariants("accent", "lg", "min-h-11 w-full sm:w-auto")}>
                Book a Demo <ArrowRightIcon size={16} />
              </Link>
              <a
                href={OVERVIEW_HREF}
                {...(DEMO_VIDEO_URL ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={buttonVariants(
                  "ghost",
                  "lg",
                  "min-h-11 w-full justify-start gap-3 bg-white sm:w-auto sm:border-transparent sm:bg-transparent sm:shadow-none",
                )}
              >
                <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-full border border-v2-line bg-white text-v2-navy">
                  <PlayIcon className="h-4 w-4" />
                </span>
                <span className="flex flex-col items-start text-left leading-tight">
                  <span className="text-[14px] font-bold text-v2-navy">Watch Overview</span>
                  <span className="text-[12.5px] font-medium text-v2-ink-soft">· 2 min</span>
                </span>
              </a>
            </div>
          </div>

          <div className="relative lg:h-[500px]">
            <Handwritten className="mb-3 block text-center lg:absolute lg:right-0 lg:top-0 lg:z-30 lg:mb-0 lg:w-36 lg:rotate-6 lg:text-left lg:text-[28px]">
              Brighter futures for your team.
            </Handwritten>
            <CurvedArrow
              direction="down-left"
              aria-hidden
              className="absolute right-6 top-28 z-30 hidden h-12 w-12 text-v2-green lg:block"
            />

            <OrgStatsMock className="relative z-10 hidden md:block lg:absolute lg:left-0 lg:right-16 lg:top-10" />

            <div className="relative mt-4 lg:absolute lg:bottom-0 lg:left-[8%] lg:right-[4%] lg:z-20 lg:mt-0">
              <Photo
                id="org-team"
                alt="A small team of colleagues looking at a laptop together"
                className="aspect-[2/1] w-full"
                sizes="(min-width: 1024px) 640px, 100vw"
                priority
              />
              <Mascot pose="headphones" className="absolute -bottom-3 -right-1 h-28 w-28 md:h-36 md:w-36 lg:-right-10 lg:bottom-0" />
            </div>
          </div>
        </Container>
      </section>

      {/* Mobile board: stat strip right under the hero. */}
      <section aria-label="Team support at a glance" className="md:hidden">
        <Container>
          <dl className="grid grid-cols-4 gap-1 rounded-[var(--radius-v2-card)] bg-white p-3 shadow-v2-card">
            {MOBILE_STRIP.map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1 text-center">
                <span aria-hidden className={cn("h-1.5 w-6 rounded-full", FAMILY[s.tone].solid)} />
                <dd className="order-1 text-[15px] font-extrabold leading-tight text-v2-navy">{s.value}</dd>
                <dt className="order-2 text-[10.5px] font-medium leading-tight text-v2-ink-soft">{s.label}</dt>
              </div>
            ))}
          </dl>
        </Container>
      </section>
    </>
  );
}
