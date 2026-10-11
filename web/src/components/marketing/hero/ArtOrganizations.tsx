import {
  CalendarIcon,
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  Confetti,
  CurvedArrow,
  FileTextIcon,
  SearchIcon,
  SparkBurst,
  StarDoodle,
  UsersIcon,
  cn,
} from "@kiwiply/ui";
import type { ComponentType } from "react";
import type { IconProps } from "@kiwiply/ui";
import Handwritten from "../Handwritten";
import { Mascot, Photo } from "../media";
import { Box, Card, Disc, Tile } from "./parts";

/**
 * Slide 4 stage (board: hero-slide-organizations): big "Team Applications" card (search, four stat
 * tiles, four candidate rows), "Team Insights" bars card over its right edge, four small side
 * cards, the three-person cutout bottom-centre and the winking mascot bottom-right. Coordinates
 * mapped from the 1774px board (scale 0.8117).
 */

const STATS = [
  { label: "Applied", value: "248", cls: "bg-[#FFF1DC]" },
  { label: "In Review", value: "96", cls: "bg-[#E6F0FF]" },
  { label: "Interview", value: "32", cls: "bg-[#E4F7E8]" },
  { label: "Offer", value: "12", cls: "bg-[#E4F7E8]" },
] as const;

const ROWS = [
  { name: "Priya S.", role: "Software Engineer", stage: "In Review", pill: "bg-[#E3EEFF] text-[#1A5BD6]", av: "bg-[#F5C9A8]" },
  { name: "Jason T.", role: "Product Manager", stage: "Interview", pill: "bg-[#DDF5E3] text-[#1A8A3A]", av: "bg-[#C9A27E]" },
  { name: "Maya K.", role: "UX Designer", stage: "Interview", pill: "bg-[#E3EEFF] text-[#1A5BD6]", av: "bg-[#B98A6A]" },
  { name: "Derek A.", role: "Data Analyst", stage: "Offer", pill: "bg-[#DDF5E3] text-[#1A8A3A]", av: "bg-[#D6B08E]" },
] as const;

const BARS = [18, 26, 34, 44, 54, 66, 78, 90];

const SIDE: { title: string[]; Icon: ComponentType<IconProps>; tone: string; x: number }[] = [
  { title: ["Collaborate", "with your team"], Icon: UsersIcon, tone: "text-[#1E6FF5]", x: 566 },
  { title: ["Track progress", "every step"], Icon: FileTextIcon, tone: "text-[#1E6FF5]", x: 582 },
  { title: ["Manage interviews", "and offers"], Icon: CalendarIcon, tone: "text-[#1E6FF5]", x: 592 },
  { title: ["Make data-driven", "hiring decisions"], Icon: ChartIcon, tone: "text-[#20B33D]", x: 600 },
];

export default function ArtOrganizations({ priority }: { priority?: boolean }) {
  return (
    <>
      <Disc x={0} y={230} d={520} color="radial-gradient(closest-side, rgba(150,190,255,.30), rgba(150,190,255,0))" z={0} />

      {/* Team Applications */}
      <Box x={-8} y={78} w={528} h={366} rot={-4} z={10}>
        <Card className="px-5 pt-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2.5 text-[18px] font-bold text-v2-navy">
              <UsersIcon className="h-6 w-6 text-[#1E6FF5]" />
              Team Applications
            </span>
            <span className="flex w-[200px] items-center gap-2 rounded-lg border border-[#E3E8F2] px-3 py-2 text-[12px] text-v2-muted">
              <SearchIcon className="h-3.5 w-3.5" />
              Search candidates…
            </span>
          </div>
          <div className="mt-3.5 grid grid-cols-4 gap-2.5">
            {STATS.map((s) => (
              <div key={s.label} className={cn("rounded-xl px-3 py-2.5", s.cls)}>
                <p className="text-[12px] font-medium text-v2-ink-soft">{s.label}</p>
                <p className="text-[24px] font-extrabold leading-tight text-v2-navy">{s.value}</p>
              </div>
            ))}
          </div>
          <ul className="mt-2.5 divide-y divide-[#EEF1F8]">
            {ROWS.map((r) => (
              <li key={r.name} className="flex items-center gap-3 py-[7px]">
                <span aria-hidden className={cn("grid h-9 w-9 flex-none place-items-center rounded-full text-[14px] font-bold text-white", r.av)}>
                  {r.name[0]}
                </span>
                <span className="w-[150px]">
                  <span className="block text-[14px] font-bold leading-tight text-v2-navy">{r.name}</span>
                  <span className="block text-[12.5px] leading-tight text-v2-ink-soft">{r.role}</span>
                </span>
                <ChevronRightIcon className="h-4 w-4 flex-none text-[#B9BFD3]" />
                <span className={cn("ml-auto w-[96px] rounded-lg px-3 py-1.5 text-center text-[12.5px] font-bold leading-none", r.pill)}>{r.stage}</span>
              </li>
            ))}
          </ul>
        </Card>
      </Box>

      {/* Team Insights */}
      <Box x={372} y={132} w={178} h={204} rot={-3} z={10}>
        <Card className="px-4 pt-3.5">
          <p className="text-[15px] font-bold text-v2-navy">Team Insights</p>
          <div aria-hidden className="mt-2 flex h-[78px] items-end gap-1.5">
            {BARS.map((h, i) => (
              <span key={i} className="w-full rounded-t-[3px] bg-gradient-to-t from-[#20B33D] to-[#6FD37A]" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-full bg-v2-green text-white">
              <CheckIcon className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-[20px] font-extrabold leading-none text-v2-navy">+40%</span>
              <span className="block text-[12.5px] text-v2-ink-soft">Faster hiring</span>
            </span>
          </div>
        </Card>
      </Box>

      {/* four small side cards */}
      {SIDE.map((c, i) => (
        <Box key={c.title[0]} x={c.x} y={66 + i * 88} w={232} h={80} rot={-6} z={10}>
          <Card className="flex items-center gap-3 px-4">
            <Tile size={36} className="bg-transparent">
              <c.Icon className={cn("h-7 w-7", c.tone)} />
            </Tile>
            <span className="text-[13.5px] font-bold leading-[1.2] text-v2-navy">
              {c.title.map((l, j) => (
                <span key={l} className={j ? "block font-medium text-v2-ink-soft" : "block"}>
                  {l}
                </span>
              ))}
            </span>
          </Card>
        </Box>
      ))}

      {/* the team (683x347 native), bottom-centre */}
      <Box x={-38} y={402} w={600} z={20}>
        <Photo id="hero-team" alt="Three colleagues smiling at their laptops" priority={priority} eager edgeFade={[7, 3]} className="w-full" sizes="600px" />
      </Box>
      <Box x={516} y={482} w={186} h={196} z={30}>
        <Mascot pose="plane" eager className="h-full w-full" />
      </Box>

      {/* handwriting + doodles */}
      <Box x={494} y={374} w={116} rot={-15} z={10}>
        <Handwritten ink="navy" className="text-[27px]">Build great teams together.</Handwritten>
      </Box>
      <Box x={448} y={72} w={50} h={44} z={10}><CurvedArrow direction="up-right" className="h-full w-full -rotate-12 text-v2-green" /></Box>
      <Box x={450} y={338} w={44} h={44} z={10}><CurvedArrow direction="down-left" className="h-full w-full rotate-12 text-v2-green" /></Box>
      <Box x={608} y={404} w={36} h={64} z={10}><CurvedArrow direction="up-right" className="h-full w-full -rotate-12 text-v2-violet" /></Box>
      <Box x={430} y={396} w={34} h={34} z={10}><StarDoodle className="h-full w-full text-v2-amber" /></Box>
      <Box x={712} y={480} w={32} h={32} z={10}><StarDoodle className="h-full w-full text-v2-amber" /></Box>
      <Box x={684} y={560} w={32} h={50} z={10}><Confetti className="h-full w-full rotate-12 text-v2-green" /></Box>
      <Box x={-30} y={96} w={36} h={50} z={10}><SparkBurst className="h-full w-full text-v2-green" /></Box>
    </>
  );
}
