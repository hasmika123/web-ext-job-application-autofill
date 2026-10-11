import { CalendarIcon, Confetti, CurvedArrow, FileTextIcon, HeartIcon, MailIcon, PaperPlane, SearchIcon, SparkBurst, StarDoodle } from "@kiwiply/ui";
import type { ComponentType } from "react";
import type { IconProps } from "@kiwiply/ui";
import Handwritten from "../Handwritten";
import { Mascot, Photo } from "../media";
import { Box, Card, Disc, Tile } from "./parts";

/**
 * Slide 2 stage (board: hero-slide-autopilot): five cards in a diagonal chain linked by green
 * curved arrows, the man centre-left, the winking mascot at his right, stars + plane + a
 * "Step by step" note upper-right. Coordinates mapped from the 1774px board (scale 0.8117).
 */

interface ChainCard {
  title: string[];
  Icon: ComponentType<IconProps>;
  tile: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  bars?: boolean;
}

const CHAIN: ChainCard[] = [
  { title: ["Find jobs", "that match you"], Icon: SearchIcon, tile: "bg-[#E6F0FF] text-[#1E6FF5]", x: 6, y: 80, w: 268, h: 152, rot: -6, bars: true },
  { title: ["Auto apply", "with AI"], Icon: FileTextIcon, tile: "bg-[#E6F0FF] text-[#1E6FF5]", x: 296, y: 104, w: 262, h: 146, rot: -6, bars: true },
  { title: ["Track updates", "in real time"], Icon: MailIcon, tile: "bg-[#FFF1D6] text-[#F5A623]", x: 326, y: 240, w: 286, h: 124, rot: -6, bars: true },
  { title: ["Prepare for", "interviews"], Icon: CalendarIcon, tile: "bg-[#EEEAFF] text-[#6A4CF5]", x: 394, y: 346, w: 282, h: 130, rot: -6, bars: true },
  { title: ["Get hired"], Icon: HeartIcon, tile: "bg-[#FFEAEA] text-[#F05252]", x: 520, y: 462, w: 226, h: 118, rot: -7, bars: true },
];

export default function ArtAutopilot({ priority }: { priority?: boolean }) {
  return (
    <>
      <Disc x={-30} y={210} d={470} color="radial-gradient(closest-side, rgba(166,235,108,.32), rgba(166,235,108,0))" z={0} />

      {/* the man (580x554 native) */}
      <Box x={-120} y={190} w={536} z={20}>
        <Photo id="hero-individual" alt="A smiling man in a green hoodie working on his laptop" priority={priority} eager edgeFade={[9, 3]} className="w-full" sizes="536px" />
      </Box>
      {/* winking mascot at his right */}
      <Box x={274} y={500} w={170} h={178} z={30}>
        <Mascot pose="laptop" eager className="h-full w-full" />
      </Box>

      {CHAIN.map((c) => (
        <Box key={c.title[0]} x={c.x} y={c.y} w={c.w} h={c.h} rot={c.rot} z={10}>
          <Card className="px-5 py-4">
            <div className="flex items-center gap-3.5">
              <Tile size={52} className={c.tile}>
                <c.Icon className="h-7 w-7" />
              </Tile>
              <span className="text-[19px] font-bold leading-[1.15] text-v2-navy">
                {c.title.map((l, i) => (
                  <span key={l} className={i ? "block font-semibold text-v2-ink-soft" : "block"}>
                    {l}
                  </span>
                ))}
              </span>
            </div>
            {c.bars && (
              <div aria-hidden className="mt-3.5 space-y-2">
                <div className="h-2.5 w-[88%] rounded-full bg-[#E8EDF8]" />
                <div className="h-2.5 w-[58%] rounded-full bg-[#E8EDF8]" />
              </div>
            )}
          </Card>
        </Box>
      ))}

      {/* chain arrows */}
      <Box x={268} y={92} w={44} h={44} z={10}><CurvedArrow direction="down-right" className="h-full w-full -rotate-12 text-v2-green" /></Box>
      <Box x={246} y={206} w={50} h={64} z={10}><CurvedArrow direction="down-right" className="h-full w-full text-v2-green" /></Box>
      <Box x={284} y={314} w={38} h={52} z={10}><CurvedArrow direction="down-right" className="h-full w-full text-v2-green" /></Box>
      <Box x={684} y={396} w={34} h={54} z={10}><CurvedArrow direction="down-right" className="h-full w-full text-v2-green" /></Box>

      {/* sparks, stars, plane */}
      <Box x={-30} y={84} w={40} h={58} z={10}><SparkBurst className="h-full w-full text-v2-green" /></Box>
      <Box x={508} y={74} w={44} h={30} z={10}><Confetti className="h-full w-full text-v2-violet" /></Box>
      <Box x={664} y={62} w={108} h={60} z={10}><PaperPlane className="h-full w-full text-v2-blue" /></Box>
      <Box x={338} y={386} w={30} h={30} z={10}><StarDoodle className="h-full w-full text-v2-amber" /></Box>
      <Box x={652} y={276} w={28} h={28} z={10}><StarDoodle className="h-full w-full text-v2-amber" /></Box>
      <Box x={470} y={510} w={32} h={32} z={10}><StarDoodle className="h-full w-full text-v2-amber" /></Box>
      <Box x={482} y={612} w={30} h={30} z={10}><StarDoodle className="h-full w-full text-v2-amber" /></Box>
      <Box x={738} y={452} w={34} h={40} z={10}><Confetti className="h-full w-full text-v2-amber" /></Box>
      <Box x={418} y={566} w={52} h={76} z={10}><CurvedArrow direction="up-right" className="h-full w-full rotate-90 text-v2-green" /></Box>

      <Box x={606} y={132} w={160} rot={-15} z={10}>
        <Handwritten ink="navy" className="text-[27px]">Step by step to your next chapter.</Handwritten>
      </Box>
    </>
  );
}
