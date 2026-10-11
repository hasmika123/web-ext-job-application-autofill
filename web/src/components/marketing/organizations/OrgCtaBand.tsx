import Link from "next/link";
import { ArrowRightIcon, HeartIcon, Squiggle, StarIcon, buttonVariants } from "@kiwiply/ui";
import { contactHref } from "@/lib/catalog";
import { HEADLINE_GREEN } from "./family";
import { Mascot, Photo } from "../media";
import Eyebrow from "../Eyebrow";
import Handwritten from "../Handwritten";
import { Avatar, Container } from "./parts";
import { ORG_TESTIMONIAL } from "./placeholder-data";

/** Block 6: "Trusted by organizations" closing band, the testimonial and the last calls to action. */
export default function OrgCtaBand() {
  const t = ORG_TESTIMONIAL;
  return (
    <section aria-labelledby="org-cta-title" className="relative overflow-hidden pb-16 pt-8 md:pb-24 lg:pb-0">
      <Container className="grid items-end gap-6 lg:grid-cols-[minmax(0,230px)_minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-6">
        {/* Bottom-anchored cutout with its handwritten note: wide screens only. It is wider than its
            column and tucks under the card; the band's bottom edge is its floor. */}
        <div className="relative hidden self-stretch lg:block">
          <Handwritten
            family="blue"
            className="absolute -top-2 left-0 z-10 w-36 -rotate-6 text-[26px]"
          >
            People. Progress. Together.
          </Handwritten>
          <HeartIcon aria-hidden className="absolute left-14 top-[5.5rem] z-10 h-5 w-5 text-v2-amber" />
          <Squiggle aria-hidden className="absolute left-2 top-28 z-10 h-6 w-10 text-v2-green" />
          <Photo
            id="hero-copilot"
            alt="A smiling colleague looking thoughtfully upward"
            className="absolute bottom-0 left-0 w-[300px]"
            sizes="300px"
            edgeFade={[0, 14]}
          />
        </div>

        <div className="relative z-10 rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-v2-card backdrop-blur max-lg:mb-8 sm:p-8 lg:mb-16 lg:p-10">
          <div className="flex flex-col items-start gap-4">
            <Eyebrow family="green">Trusted by organizations</Eyebrow>
            <h2 id="org-cta-title" className="max-w-xl text-[28px] leading-[1.1] text-v2-navy md:text-[36px]">
              Help your team land more opportunities <span className={HEADLINE_GREEN}>with less busywork.</span>
            </h2>
            <p className="max-w-xl text-base leading-relaxed text-v2-ink-soft md:text-[17px]">
              Join organizations that are creating brighter futures for their people with Kiwiply.
            </p>
            <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href={contactHref("organization")} className={buttonVariants("accent", "lg", "min-h-11 w-full sm:w-auto")}>
                Book a Demo <ArrowRightIcon size={16} />
              </Link>
              <Link href="/pricing" className={buttonVariants("ghost", "lg", "min-h-11 w-full bg-white sm:w-auto")}>
                View Pricing
              </Link>
            </div>
          </div>
          <Mascot pose="laptop" className="absolute -bottom-12 right-3 h-24 w-24 sm:right-6 sm:h-28 sm:w-28 lg:hidden" />
        </div>

        <figure className="flex flex-col gap-5 lg:mb-16 rounded-[var(--radius-v2-card)] border border-white/70 bg-white p-6 shadow-v2-card">
          <blockquote className="text-[14.5px] leading-relaxed text-v2-ink-soft">&ldquo;{t.quote}&rdquo;</blockquote>
          <figcaption className="flex items-center gap-3">
            <Avatar initials="PS" family="coral" className="h-11 w-11 text-[13px]" />
            <span className="flex flex-col leading-tight">
              <span className="text-[14px] font-bold text-v2-navy">{t.name}</span>
              <span className="text-[12.5px] text-v2-ink-soft">{t.role}</span>
            </span>
          </figcaption>
          <p className="flex gap-0.5 text-v2-amber" role="img" aria-label={`${t.stars} out of 5 stars`}>
            {Array.from({ length: t.stars }, (_, i) => (
              <StarIcon key={i} aria-hidden className="h-4 w-4 fill-current" />
            ))}
          </p>
        </figure>
      </Container>
    </section>
  );
}
