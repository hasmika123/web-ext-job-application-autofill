import { Confetti } from "@kiwiply/ui";
import Handwritten from "../Handwritten";
import { Mascot } from "../media";
import DashboardMock from "../mocks/DashboardMock";
import Section from "../Section";
import SectionHeading from "../SectionHeading";

/**
 * One dashboard (spec 7.2 item 7): centred heading, large DashboardMock below. V2.3b: the peeking
 * mascot (its top-left is clipped in the source art) hides behind the mock's lower-right corner,
 * so the mock covers exactly the clipped part.
 */
export default function Dashboard() {
  return (
    <Section id="dashboard" labelledBy="dashboard-title">
      <SectionHeading
        id="dashboard-title"
        eyebrow="One dashboard"
        family="violet"
        title="Keep track of everything"
        accent="in one place."
        align="center"
      />
      <div className="relative mx-auto mt-10 max-w-4xl lg:pt-14">
        <Handwritten
          family="violet"
          className="mb-4 text-center lg:absolute lg:right-6 lg:top-0 lg:z-20 lg:mb-0 lg:w-64 lg:rotate-3 lg:text-left"
        >
          Stay organised. Make progress.
        </Handwritten>
        <Confetti aria-hidden className="absolute -left-4 top-8 hidden h-8 w-8 text-v2-amber lg:block" />
        <DashboardMock className="relative z-10" />
        <Mascot
          pose="peek"
          className="absolute -bottom-14 -right-4 z-0 h-[150px] w-[120px] sm:-bottom-20 sm:-right-10 sm:h-[190px] sm:w-[152px] lg:-right-[88px]"
        />
      </div>
    </Section>
  );
}
