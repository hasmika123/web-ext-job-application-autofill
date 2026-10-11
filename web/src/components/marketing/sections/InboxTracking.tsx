import Link from "next/link";
import { ArrowRightIcon, CurvedArrow, SparkBurst } from "@kiwiply/ui";
import { buttonVariants } from "@/components/ui";
import Handwritten from "../Handwritten";
import { Mascot } from "../media";
import InboxMock from "../mocks/InboxMock";
import { SIGNUP_HREF } from "../nav";
import Section from "../Section";
import SectionHeading from "../SectionHeading";

/** Inbox tracking (spec 7.2 item 4): lime-soft band, copy left, InboxMock + mascot right. */
export default function InboxTracking() {
  return (
    <Section
      id="inbox"
      labelledBy="inbox-title"
      className="bg-gradient-to-b from-v2-lime-soft/70 via-v2-lime-soft/40 to-transparent"
    >
      <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div className="flex flex-col items-start gap-6">
          <SectionHeading
            id="inbox-title"
            eyebrow="Track applications"
            family="lime"
            title="We track your job-application emails"
            accent="automatically."
            lede="Connect your Gmail and Kiwiply reads recruiter replies, interview invites and rejections, then updates your board — we never send, move or delete mail."
          />
          <Link href={SIGNUP_HREF} className={buttonVariants("accent", "lg", "min-h-11 w-full sm:w-auto")}>
            See how Inbox works <ArrowRightIcon size={16} />
          </Link>
          <p className="max-w-md text-[13px] leading-relaxed text-v2-muted">
            Gmail only, with an App Password. We keep message headers and text, never attachments.
          </p>
        </div>

        <div className="relative pb-24 sm:pb-28 sm:pt-16">
          <Handwritten
            family="green"
            className="mb-4 text-center sm:absolute sm:right-6 sm:top-0 sm:z-20 sm:mb-0 sm:w-64 sm:rotate-3 sm:text-left"
          >
            We&apos;ll keep an eye on your inbox!
          </Handwritten>
          <SparkBurst aria-hidden className="absolute -left-3 top-6 hidden h-9 w-9 text-v2-lime-deep sm:block" />
          <CurvedArrow
            direction="down-left"
            aria-hidden
            className="absolute right-2 top-12 z-20 hidden h-10 w-10 text-v2-green lg:block"
          />
          <InboxMock className="relative z-10" />
          <div className="absolute bottom-0 right-0 z-20 sm:-right-2">
            <Mascot pose="envelope" className="h-28 w-28 sm:h-36 sm:w-36" />
          </div>
        </div>
      </div>
    </Section>
  );
}
