import { Mascot } from "../media";
import { Container, OrgCtas } from "./parts";

/** Block 6: closing call-to-action band; the waving mascot sits on the band's bottom edge (md+). */
export default function OrgCtaBand() {
  return (
    <section aria-labelledby="org-cta-title" className="pb-16 pt-4 md:pb-24">
      <Container>
        <div className="relative flex flex-col items-start gap-6 overflow-hidden rounded-[28px] bg-v2-lime-soft p-6 sm:p-10 md:flex-row md:items-center md:justify-between md:gap-10 md:pr-64">
          <div className="flex max-w-2xl flex-col gap-4">
            <h2 id="org-cta-title" className="text-[28px] leading-[1.1] text-v2-navy md:text-[36px] md:leading-[1.1]">
              Help your team land more opportunities with less busywork.
            </h2>
            <p className="text-base leading-relaxed text-v2-ink-soft">
              Tell us about your team and we&apos;ll set up a plan that fits. Pricing is a one-time setup fee plus a plan for each person.
            </p>
            <OrgCtas className="mt-1" />
          </div>
          <Mascot pose="wave" className="absolute bottom-0 right-8 hidden h-[200px] w-[190px] md:block lg:right-14" />
        </div>
      </Container>
    </section>
  );
}
