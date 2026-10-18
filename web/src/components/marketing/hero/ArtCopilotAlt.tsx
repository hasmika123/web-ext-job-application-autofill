import { CurvedArrow, GoogleIcon, SparkBurst, StarDoodle, cn } from "@kiwiply/ui";
import Handwritten from "../Handwritten";
import { Mascot, Photo } from "../media";
import { Box, Card, Disc, Sticky } from "./parts";

/**
 * ALTERNATE slide 1 (not rendered by default; see `HERO_SLIDE_COPILOT_ALT` in hero-slides.tsx):
 * the woman-in-a-lime-hoodie version from the landing-desktop-full board. Woman centre-right with
 * the clapping mascot tucked behind her laptop edge, a three-row "Apply" card top-right and the
 * "Less busy work. More you." sticky.
 */

const JOBS = [
  { co: "Google", role: "Software Engineer", sub: "Remote · Full-time", mark: "google" },
  { co: "Airbnb", role: "Frontend Developer", sub: "Remote · Full-time", mark: "A", tint: "bg-[#FFE8EC] text-[#FF385C]" },
  { co: "Microsoft", role: "Product Manager", sub: "Hybrid · Full-time", mark: "M", tint: "bg-[#E6F0FF] text-[#0078D4]" },
] as const;

export default function ArtCopilotAlt({ priority }: { priority?: boolean }) {
  return (
    <>
      <Disc x={60} y={150} d={520} color="radial-gradient(closest-side, rgba(166,235,108,.45), rgba(166,235,108,0))" z={0} />

      <Box x={150} y={196} w={435} z={20}>
        <Photo id="hero-copilot" alt="A smiling job seeker at her laptop" priority={priority} eager className="w-full" sizes="435px" />
      </Box>
      {/* clapping mascot, left edge tucked behind her arm / laptop */}
      <Box x={392} y={430} w={150} h={167} z={15}>
        <Mascot pose="clap" eager className="h-full w-full" />
      </Box>

      <Box x={468} y={64} w={286} h={236} z={10}>
        <Card className="divide-y divide-[#EEF1F8] px-4">
          {JOBS.map((j) => (
            <div key={j.co} className="flex items-center gap-3 py-3">
              {j.mark === "google" ? (
                <GoogleIcon size={32} />
              ) : (
                <span aria-hidden className={cn("grid h-8 w-8 flex-none place-items-center rounded-lg text-[15px] font-extrabold", j.tint)}>
                  {j.mark}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold leading-tight text-v2-muted">{j.co}</span>
                <span className="block truncate text-[14px] font-bold leading-tight text-v2-navy">{j.role}</span>
                <span className="block text-[11.5px] leading-tight text-v2-muted">{j.sub}</span>
              </span>
              <span className="rounded-lg bg-v2-lime px-3.5 py-1.5 text-[12.5px] font-bold leading-none text-v2-navy">Apply</span>
            </div>
          ))}
        </Card>
      </Box>

      <Box x={560} y={382} w={176} h={140} rot={-4} z={30}>
        <Sticky className="h-full w-full rounded-[6px] px-5 py-4 text-[27px]">
          Less
          <br />
          busy work.
          <br />
          More you.
        </Sticky>
      </Box>

      <Box x={44} y={96} w={210} rot={-8} z={10}>
        <Handwritten ink="navy" className="text-[28px]">Same me. More opportunities.</Handwritten>
      </Box>
      <Box x={-4} y={118} w={36} h={36} z={10}><StarDoodle className="h-full w-full text-v2-green" /></Box>
      <Box x={22} y={206} w={80} h={70} z={10}><CurvedArrow direction="up-right" className="h-full w-full -rotate-45 text-v2-green" /></Box>
      <Box x={300} y={90} w={34} h={34} z={10}><SparkBurst className="h-full w-full text-v2-green" /></Box>
    </>
  );
}
