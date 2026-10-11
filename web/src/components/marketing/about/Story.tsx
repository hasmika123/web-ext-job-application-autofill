import { HeartIcon } from "@kiwiply/ui";
import Eyebrow from "../Eyebrow";
import { FAMILY } from "../family";
import Handwritten from "../Handwritten";
import { Mascot, Photo } from "../media";
import Section from "../Section";
import { MissionButton } from "./shared";

/**
 * "Built for brighter careers." Copy left, team photo + handwriting + sticky + mascot right.
 * Mobile order: copy, photo, button (as on the mobile board).
 */
export default function Story() {
  return (
    <Section labelledBy="story-title" className="py-10 lg:py-14">
      <div className="grid gap-x-6 gap-y-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-center lg:gap-x-12">
        <div className="md:col-start-1 md:row-start-1">
          <Eyebrow family="green">Our Story</Eyebrow>
          <h2 id="story-title" className="mt-4 text-[28px] text-v2-navy md:text-[clamp(24px,3.2vw,40px)]">
            Built for <span className={FAMILY.green.headline}>brighter careers.</span>
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-v2-ink-soft md:text-[17px]">
            Kiwiply started with a simple idea: job searching should be more human, less hectic. Our team of
            builders, designers, and career advocates came together to create a platform that helps people
            find meaningful opportunities and reach their potential.
          </p>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-v2-ink-soft md:text-[17px]">
            Today, Kiwiply is in beta and improving every week, built for job seekers and the organizations that
            believe in a brighter, more inclusive future of work.
          </p>
        </div>

        <div className="relative md:col-start-2 md:row-span-2 md:row-start-1">
          <div className="relative flex min-h-[260px] items-end justify-center overflow-hidden rounded-[32px] bg-gradient-to-br from-v2-lime-soft via-white to-v2-blue-soft pt-16 md:min-h-[clamp(260px,34vw,360px)] md:rounded-[48px]">
            <div className="w-[92%] md:w-[84%]">
              <Photo
                id="about-team"
                alt="A small team gathered around a laptop, smiling"
                className="w-full"
                sizes="(min-width: 1024px) 560px, 92vw"
              />
            </div>
          </div>

          <Handwritten
            family="violet"
            className="absolute left-4 top-4 w-44 -rotate-6 text-[24px] md:left-5 md:top-5 md:w-[clamp(150px,18vw,208px)] md:text-[clamp(20px,2.2vw,26px)]"
          >
            A brighter future of work. Together.
            <HeartIcon size={16} className="ml-1 inline text-v2-blue" />
          </Handwritten>

          <div
            aria-hidden
            className="absolute -right-1 top-6 z-10 w-[112px] rotate-[4deg] rounded-md bg-v2-sticky px-3 py-2.5 shadow-v2-card md:-right-3 md:top-10 md:w-[clamp(100px,11vw,128px)]"
          >
            <p className="font-[family-name:var(--font-hand)] text-[18px] leading-[1.1] text-v2-sticky-ink">
              People Opportunity Progress Always.
              <HeartIcon size={13} className="ml-1 inline text-v2-amber" fill="currentColor" />
            </p>
          </div>

          <Mascot
            pose="headphones"
            className="absolute -bottom-3 right-2 z-10 h-24 w-24 md:bottom-0 md:right-4 md:h-[clamp(80px,10vw,128px)] md:w-[clamp(80px,10vw,128px)]"
          />
        </div>

        <div className="md:col-start-1 md:row-start-2 md:self-start">
          <MissionButton />
        </div>
      </div>
    </Section>
  );
}
