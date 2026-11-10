import { Confetti } from "@kiwiply/ui";
import Handwritten from "../Handwritten";
import DashboardMock, { DashboardStats } from "../mocks/DashboardMock";
import Section from "../Section";
import SectionHeading from "../SectionHeading";
import { CtaLink } from "./shared";

/**
 * One dashboard (spec 13.2 item 6): copy left, the sidebar + "My Applications" mock in the middle,
 * the 12 / 5 / 3 stat cards stacked at its right with the handwritten note above them. Mobile
 * order: heading, mock, stat row, CTA.
 */
export default function Dashboard() {
  return (
    <Section id="dashboard" labelledBy="dashboard-title">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)] md:gap-x-6 md:gap-y-5 lg:grid-cols-[0.85fr_1.7fr_0.5fr] lg:gap-x-8 lg:gap-y-6">
        <SectionHeading
          id="dashboard-title"
          eyebrow="One Dashboard"
          family="green"
          caps
          title="Keep track of everything in one place."
          lede="All your applications, interviews, offers and notes — organized automatically."
          className="md:self-end [&_h2]:md:text-[clamp(22px,2.6vw,40px)] [&_p]:md:text-[clamp(13.5px,1.15vw,17px)]"
        />
        <DashboardMock className="md:col-start-2 md:row-span-2 md:row-start-1 md:self-center" />
        <div className="relative md:col-start-2 md:row-start-3 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:self-center">
          <Handwritten
            family="violet"
            className="mb-4 text-center md:mb-2 md:text-left lg:absolute lg:-top-24 lg:left-0 lg:mb-0 lg:w-44 lg:rotate-3"
          >
            Stay organized. Make progress.
          </Handwritten>
          <Confetti aria-hidden className="absolute -right-1 -top-8 hidden h-6 w-6 text-v2-amber lg:block" />
          <DashboardStats />
        </div>
        <div className="md:col-start-1 md:row-start-2 md:self-start">
          <CtaLink href="/dashboard">View Your Dashboard</CtaLink>
        </div>
      </div>
    </Section>
  );
}
