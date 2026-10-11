import { CurvedArrow, SparkBurst, StarDoodle } from "@kiwiply/ui";
import Handwritten from "../Handwritten";
import { Mascot } from "../media";
import InboxMock from "../mocks/InboxMock";
import { SIGNUP_HREF } from "../nav";
import Section from "../Section";
import SectionHeading from "../SectionHeading";
import { CtaLink } from "./shared";

/**
 * Track applications (spec 13.2 item 3): a lime-soft rounded band. Desktop: copy | a column of
 * Gmail / Outlook / Yahoo lettered tiles (with the "No more checking manually!" note) | the inbox
 * mock, with the second note and the envelope mascot in its right gutter. Mobile: copy, CTA, tiles
 * in a row, inbox, then the mascot beside its note.
 */
const PROVIDERS = [
  { name: "Gmail", letter: "M", color: "#EA4335" },
  { name: "Outlook", letter: "O", color: "#0F6CBD" },
  { name: "Yahoo", letter: "Y", color: "#6001D2" },
];

export default function InboxTracking() {
  return (
    <Section id="inbox" labelledBy="inbox-title" tone="lime">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[0.85fr_92px_1.4fr] lg:items-center lg:gap-6">
        <div className="flex flex-col items-start gap-6">
          <SectionHeading
            id="inbox-title"
            eyebrow="Track Applications"
            family="green"
            caps
            title="We track your job application emails automatically."
            lede="Connect your Gmail or Outlook and Kiwiply monitors recruiter responses, interview invites, rejections and more — then alerts you instantly."
          />
          <CtaLink href={SIGNUP_HREF}>Connect Your Email</CtaLink>
        </div>

        <div className="flex flex-row items-center justify-start gap-3 lg:flex-col lg:items-stretch lg:gap-4">
          <ul className="flex gap-3 lg:flex-col lg:gap-4">
            {PROVIDERS.map((p) => (
              <li
                key={p.name}
                className="grid h-[68px] w-[68px] place-items-center rounded-2xl border border-white bg-white shadow-v2-card lg:h-[76px] lg:w-[76px]"
              >
                <span className="sr-only">{p.name}</span>
                <span aria-hidden className="text-[32px] font-extrabold leading-none" style={{ color: p.color }}>
                  {p.letter}
                </span>
              </li>
            ))}
          </ul>
          <Handwritten family="amber" className="hidden w-28 -rotate-6 text-[22px] lg:block">
            No more checking manually!
          </Handwritten>
        </div>

        <div className="relative lg:pb-4 lg:pt-6">
          <SparkBurst aria-hidden className="absolute -left-3 top-2 hidden h-7 w-7 text-v2-lime-deep lg:block" />
          <InboxMock className="relative z-10 lg:w-[76%]" />
          {/* Desktop: the note sits in the gutter right of the mock, the mascot hugs the band's edge. */}
          <Handwritten
            family="blue"
            className="absolute right-0 top-2 hidden w-[19%] rotate-6 text-[24px] lg:block"
          >
            We&apos;ll keep an eye on your inbox!
          </Handwritten>
          <StarDoodle aria-hidden className="absolute right-[1%] top-[44%] hidden h-5 w-5 text-v2-amber lg:block" />
          <CurvedArrow
            direction="down-left"
            aria-hidden
            className="absolute right-[8%] top-[34%] hidden h-9 w-9 text-v2-green lg:block"
          />
          <Mascot
            pose="envelope"
            className="absolute bottom-[-6px] right-[-14px] z-20 hidden h-40 w-40 lg:block xl:h-44 xl:w-44"
          />
          <div className="mt-4 flex items-end gap-2 lg:hidden">
            <Mascot pose="envelope" className="-mb-4 h-32 w-32" />
            <Handwritten family="blue" className="mb-6 w-40 -rotate-3 text-[24px]">
              We&apos;ll keep an eye on your inbox!
            </Handwritten>
          </div>
        </div>
      </div>
    </Section>
  );
}
