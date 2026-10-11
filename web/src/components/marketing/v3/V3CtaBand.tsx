import Image from "next/image";
import { CurvedArrow, PaperPlane } from "@kiwiply/ui";
import { SIGNUP_HREF } from "../nav";
import { V3Cta } from "./parts";

/**
 * Dark call-to-action band (phone board): sticky note "Big dreams. You got this.", "Your next
 * opportunity is waiting.", "Get Started Free" and "No credit card required." On md+ the laptop
 * mascot stands at the right.
 */
export default function V3CtaBand() {
  return (
    <section aria-labelledby="v3-cta-title" className="overflow-x-clip px-5 py-6 lg:px-8">
      <div className="relative mx-auto max-w-[1100px] overflow-hidden rounded-[28px] bg-[#0B2A24] px-6 pb-8 pt-9 text-white md:px-12 md:py-14 lg:rounded-[32px]">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_0%_0%,rgba(132,227,61,.28),transparent_50%),radial-gradient(ellipse_at_100%_100%,rgba(95,191,31,.3),transparent_50%)]"
        />
        <div className="relative grid grid-cols-[minmax(0,1fr)] items-center gap-6 md:grid-cols-[1fr_240px]">
          <div className="flex flex-col items-start">
            <div className="relative mb-5 inline-block">
              <p
                aria-hidden
                className="-rotate-[8deg] rounded-md bg-v2-sticky px-3.5 py-2 font-[family-name:var(--font-hand)] text-[21px] leading-[1.05] text-v2-sticky-ink shadow-md"
              >
                Big
                <br />
                dreams.
                <br />
                You got this.
              </p>
              <CurvedArrow aria-hidden direction="up-right" className="absolute -right-14 -top-2 h-9 w-12 text-v2-lime" />
            </div>
            <h2 id="v3-cta-title" className="max-w-md text-[34px] text-white md:text-[42px]">
              Your next opportunity is waiting.
            </h2>
            <p className="mt-4 flex items-center gap-3 text-[16px] leading-snug text-white/85">
              <span>
                Save time. Apply smarter.
                <br />
                Get hired with Kiwiply.
              </span>
              <PaperPlane aria-hidden className="h-7 w-9 flex-none text-v2-lime" />
            </p>
            <div className="mt-6 w-full sm:w-auto">
              <V3Cta href={SIGNUP_HREF}>Get Started Free</V3Cta>
            </div>
            <p className="mt-4 w-full text-center text-[13px] text-white/70 sm:w-auto sm:text-left">No credit card required.</p>
          </div>
          <Image
            src="/v2/app/mascot-laptop-big.png"
            alt=""
            width={270}
            height={254}
            sizes="240px"
            className="hidden h-auto w-[240px] justify-self-end md:block"
          />
        </div>
      </div>
    </section>
  );
}
