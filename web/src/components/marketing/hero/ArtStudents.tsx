import {
  BriefcaseIcon,
  ChartIcon,
  ChatIcon,
  Confetti,
  CurvedArrow,
  GraduationCapIcon,
  LayersIcon,
  LightbulbIcon,
  PaperPlane,
  PencilIcon,
  PlayIcon,
  SparkBurst,
  SparklesIcon,
  StarDoodle,
  UsersIcon,
  XIcon,
  cn,
} from "@kiwiply/ui";
import type { ComponentType } from "react";
import type { IconProps } from "@kiwiply/ui";
import Handwritten from "../Handwritten";
import { Photo } from "../media";
import { Box, Card, Disc, Tile } from "./parts";

/**
 * Slide 3 stage (board: hero-slide-students): "Career matches", "Top skills for you" and
 * "Learning resources" cards over the student cutout (which already contains the mascot), a stack
 * of three book spines at her left and two handwritten notes. Coordinates mapped from the 1774px
 * board (scale 0.8117).
 */

const MATCHES: { role: string; Icon: ComponentType<IconProps>; tone: string; pct?: string; pill?: string }[] = [
  { role: "Product Designer", Icon: ChartIcon, tone: "text-[#6A4CF5]", pct: "96% Match", pill: "bg-[#E4F7E8] text-[#1A8A3A]" },
  { role: "Data Analyst", Icon: BriefcaseIcon, tone: "text-[#F05252]", pct: "88% Match", pill: "bg-[#E3EEFF] text-[#1A5BD6]" },
  { role: "Software Engineer", Icon: LayersIcon, tone: "text-[#1EA7A0]", pct: "82% Match", pill: "bg-[#E3EEFF] text-[#1A5BD6]" },
  { role: "UX Researcher", Icon: SparklesIcon, tone: "text-[#1EA7A0]" },
];

const SKILLS: { name: string; Icon: ComponentType<IconProps>; tone: string }[] = [
  { name: "Problem Solving", Icon: LightbulbIcon, tone: "text-[#1E6FF5]" },
  { name: "Communication", Icon: ChatIcon, tone: "text-[#1E6FF5]" },
  { name: "Data Analysis", Icon: ChartIcon, tone: "text-[#6A4CF5]" },
  { name: "Creativity", Icon: PencilIcon, tone: "text-[#6A4CF5]" },
  { name: "Leadership", Icon: UsersIcon, tone: "text-[#1E6FF5]" },
];

const THUMBS = [
  "bg-gradient-to-br from-[#D8C7B8] via-[#B7C4D6] to-[#8EA3C0]",
  "bg-gradient-to-br from-[#C9B7F2] via-[#A99BE8] to-[#7C86E0]",
  "bg-gradient-to-br from-[#9ED3E6] via-[#7BB6DA] to-[#5F8FC4]",
];

const SPINES = [
  { label: "Career Exploration", cls: "from-[#BFE9E4] to-[#86CFC9] text-[#1C6F6A]", x: 18 },
  { label: "Build New Skills", cls: "from-[#C9BCF5] to-[#A592EC] text-white", x: 6 },
  { label: "Land Your First Job", cls: "from-[#DAD3F6] to-[#BDB3EC] text-[#4A3FA8]", x: 0 },
];

export default function ArtStudents({ priority }: { priority?: boolean }) {
  return (
    <>
      <Disc x={20} y={200} d={500} color="radial-gradient(closest-side, rgba(190,170,255,.34), rgba(190,170,255,0))" z={0} />

      {/* student cutout (611x516 native; the mascot is part of the image) */}
      <Box x={96} y={246} w={536} z={20}>
        <Photo
          id="hero-student"
          alt="A student in a purple hoodie, thinking, at her laptop with the Kiwiply mascot beside her"
          priority={priority}
          eager
          edgeFade={[8, 6]}
          className="w-full"
          sizes="536px"
        />
      </Box>

      {/* book spines */}
      {SPINES.map((s, i) => (
        <Box key={s.label} x={18 + s.x} y={566 + i * 36} w={236} h={34} z={25}>
          <div
            className={cn(
              "flex h-full w-full items-center rounded-l-[6px] rounded-r-[3px] bg-gradient-to-r px-5 text-[14px] font-semibold shadow-[0_4px_10px_rgba(27,31,94,.14)]",
              s.cls,
            )}
          >
            {s.label}
          </div>
        </Box>
      ))}

      {/* Career matches */}
      <Box x={0} y={62} w={318} h={240} rot={-4} z={10}>
        <Card className="px-5 pt-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2.5 text-[16px] font-bold text-v2-navy">
              <ChartIcon className="h-[22px] w-[22px] text-[#6A4CF5]" />
              Career matches
            </span>
            <XIcon className="h-3.5 w-3.5 text-[#C2C7D8]" />
          </div>
          <ul className="mt-3 space-y-3">
            {MATCHES.map((m) => (
              <li key={m.role} className="flex items-center gap-3">
                <m.Icon className={cn("h-[22px] w-[22px] flex-none", m.tone)} />
                <span className={cn("flex-1 text-[14px] font-semibold leading-tight", m.pct ? "text-v2-navy" : "text-v2-ink-soft")}>{m.role}</span>
                {m.pct && <span className={cn("rounded-lg px-2.5 py-1.5 text-[12px] font-bold leading-none", m.pill)}>{m.pct}</span>}
              </li>
            ))}
          </ul>
        </Card>
      </Box>

      {/* Top skills for you */}
      <Box x={352} y={82} w={248} h={248} rot={-4} z={10}>
        <Card className="px-5 pt-4">
          <span className="flex items-center gap-2.5 text-[16px] font-bold text-v2-navy">
            <LayersIcon className="h-[22px] w-[22px] text-[#1E6FF5]" />
            Top skills for you
          </span>
          <ul className="mt-3 space-y-2.5">
            {SKILLS.map((s) => (
              <li key={s.name} className="flex items-center gap-3 text-[14px] font-medium text-v2-ink-soft">
                <s.Icon className={cn("h-5 w-5 flex-none", s.tone)} />
                {s.name}
              </li>
            ))}
          </ul>
        </Card>
      </Box>

      {/* Learning resources */}
      <Box x={410} y={322} w={306} h={150} rot={-4} z={10}>
        <Card className="px-5 pt-4">
          <span className="flex items-center gap-2.5 text-[16px] font-bold text-v2-navy">
            <Tile size={26} className="rounded-lg bg-[#E6F0FF] text-[#1E6FF5]">
              <GraduationCapIcon className="h-4 w-4" />
            </Tile>
            Learning resources
          </span>
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {THUMBS.map((t, i) => (
              <span key={i} aria-hidden className={cn("relative grid h-[64px] place-items-center rounded-[10px]", t)}>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/85 text-v2-navy">
                  <PlayIcon className="h-2.5 w-2.5" />
                </span>
              </span>
            ))}
          </div>
        </Card>
      </Box>

      {/* handwriting */}
      <Box x={-16} y={346} w={110} rot={-17} z={10}>
        <Handwritten ink="navy" className="text-[27px] leading-[1.02]">
          Explore
          <br />
          Learn
          <br />
          Grow
          <br />
          Get hired.
        </Handwritten>
      </Box>
      <Box x={636} y={140} w={150} rot={-14} z={10}>
        <Handwritten ink="navy" className="text-[27px] leading-[1.02]">
          Your future step by step.
        </Handwritten>
      </Box>

      {/* doodles */}
      <Box x={-82} y={82} w={34} h={58} z={10}><SparkBurst className="h-full w-full text-v2-green" /></Box>
      <Box x={70} y={318} w={34} h={34} z={10}><StarDoodle className="h-full w-full text-v2-amber" /></Box>
      <Box x={604} y={226} w={30} h={30} z={10}><StarDoodle className="h-full w-full text-v2-amber" /></Box>
      <Box x={316} y={104} w={44} h={52} z={10}><CurvedArrow direction="down-right" className="h-full w-full -rotate-12 text-v2-green" /></Box>
      <Box x={304} y={236} w={40} h={50} z={10}><CurvedArrow direction="down-right" className="h-full w-full rotate-12 text-v2-violet" /></Box>
      <Box x={620} y={86} w={90} h={50} z={10}><PaperPlane className="h-full w-full text-v2-blue" /></Box>
      <Box x={366} y={448} w={46} h={36} z={10}><Confetti className="h-full w-full text-v2-green" /></Box>
      <Box x={396} y={510} w={30} h={30} z={10}><CurvedArrow direction="down-right" className="h-full w-full text-v2-violet" /></Box>
    </>
  );
}
