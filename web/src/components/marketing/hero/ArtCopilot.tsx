import { ChevronRightIcon, GoogleIcon, HeartIcon, MailIcon, CalendarIcon, FileTextIcon, UserIcon, Confetti, SparkBurst, ArrowRightIcon, cn } from "@kiwiply/ui";
import Handwritten from "../Handwritten";
import { Photo } from "../media";
import Laptop from "./Laptop";
import { Box, Card, Disc, Sticky, Tile } from "./parts";

/**
 * Slide 1 stage (board: hero-slide-copilot-with-feature-strip): head-and-shoulders man centre-left
 * over a big soft lime circle, CSS laptop in front, "Top Job Matches" card, four side cards,
 * sticky note, handwriting. No large mascot on this board (only the sticker on the laptop).
 * Coordinates are stage px, mapped from the 1832px board (scale 0.786).
 */

const ROWS = [
  { role: "Product Designer", co: "Spotify · Remote", pct: "98% Match", pill: "bg-[#E4F7E8] text-[#1A8A3A]", mark: "spotify" },
  { role: "UX Researcher", co: "Google · New York, NY", pct: "92% Match", pill: "bg-[#E3EEFF] text-[#1A5BD6]", mark: "google" },
  { role: "Product Manager", co: "Notion · Remote", pct: "88% Match", pill: "bg-[#FFE7E7] text-[#D63A3A]", mark: "notion" },
] as const;

function CompanyMark({ mark }: { mark: (typeof ROWS)[number]["mark"] }) {
  if (mark === "google") return <GoogleIcon size={34} />;
  if (mark === "spotify")
    return (
      <span aria-hidden className="grid h-[34px] w-[34px] place-items-center rounded-full bg-[#1ED760] text-[15px] font-extrabold text-[#0B1B10]">
        S
      </span>
    );
  return (
    <span aria-hidden className="grid h-[34px] w-[34px] place-items-center rounded-[7px] border-2 border-[#111] bg-white font-serif text-[20px] font-bold leading-none text-[#111]">
      N
    </span>
  );
}

const SIDE = [
  { title: ["Auto apply", "with AI"], Icon: FileTextIcon, tile: "bg-[#E6F0FF] text-[#1E6FF5]", x: 586 },
  { title: ["Track updates", "in real time"], Icon: MailIcon, tile: "bg-[#FFF1D6] text-[#F5A623]", x: 596 },
  { title: ["Prepare for", "interviews"], Icon: CalendarIcon, tile: "bg-[#E6F0FF] text-[#1E6FF5]", x: 604 },
  { title: ["Get hired"], Icon: HeartIcon, tile: "bg-[#FFEAEA] text-[#F05252]", x: 612 },
] as const;

export default function ArtCopilot({ priority }: { priority?: boolean }) {
  return (
    <>
      {/* big soft lime circle behind him */}
      <Disc x={-60} y={160} d={500} color="radial-gradient(closest-side, rgba(166,235,108,.66), rgba(166,235,108,.34) 70%, rgba(166,235,108,0))" z={0} />
      <Disc x={-130} y={330} d={150} color="rgba(166,235,108,.22)" blur={6} z={0} />

      {/* the man (441x343 native), bottom hidden behind the laptop */}
      <Box x={-90} y={225} w={441} z={20}>
        <Photo
          id="hero-headphones"
          alt="A young man smiling, resting his chin on his hand"
          priority={priority}
          eager
          edgeFade={[12, 0]}
          className="w-full"
          sizes="441px"
        />
      </Box>

      {/* laptop silhouette + sticker (extends below the hero edge, hidden by the strip) */}
      <Box x={90} y={452} w={262} h={250} rot={-5} z={30}>
        <Laptop className="h-full w-full" sticker={42} />
      </Box>

      {/* Top Job Matches */}
      <Box x={262} y={128} w={332} h={262} rot={-4} z={10}>
        <Card className="px-5 pt-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[14px] font-bold text-v2-navy">
              <span aria-hidden className="grid h-5 w-5 place-items-center rounded-md bg-[#E6F0FF] text-[#1E6FF5]">
                <UserIcon className="h-3 w-3" />
              </span>
              Top Job Matches for You
            </span>
            <span className="flex items-center gap-1 text-[12.5px] font-semibold text-[#1E6FF5]">
              View all <ArrowRightIcon className="h-3 w-3" />
            </span>
          </div>
          <ul className="mt-3.5 space-y-3.5">
            {ROWS.map((r) => (
              <li key={r.role} className="flex items-center gap-3">
                <CompanyMark mark={r.mark} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold leading-tight text-v2-navy">{r.role}</span>
                  <span className="mt-0.5 block truncate text-[12px] leading-tight text-v2-muted">{r.co}</span>
                </span>
                <span className={cn("flex-none rounded-lg px-3 py-1.5 text-[12px] font-bold leading-none", r.pill)}>{r.pct}</span>
              </li>
            ))}
          </ul>
        </Card>
      </Box>

      {/* four small side cards */}
      {SIDE.map((c, i) => (
        <Box key={c.title[0]} x={c.x} y={125 + i * 86} w={208} h={80} rot={-6} z={10}>
          <Card className="flex items-center gap-2.5 px-3.5">
            <Tile size={36} className={c.tile}>
              <c.Icon className="h-5 w-5" />
            </Tile>
            <span className="flex-1 text-[13.5px] font-bold leading-[1.2] text-v2-navy">
              {c.title.map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))}
            </span>
            <ChevronRightIcon className="h-4 w-4 flex-none text-[#B9BFD3]" />
          </Card>
        </Box>
      ))}

      {/* sticky note */}
      <Box x={346} y={410} w={150} h={124} rot={-8} z={30}>
        <Sticky className="h-full w-full rounded-[6px] px-4 py-3 text-[25px]">
          Less
          <br />
          busy work.
          <br />
          More you.
        </Sticky>
      </Box>
      <Box x={318} y={404} w={34} h={34} z={30}><SparkBurst className="h-full w-full -rotate-90 text-v2-green" /></Box>

      {/* handwriting + doodles */}
      <Box x={-70} y={150} w={150} rot={-16} z={10}>
        <Handwritten ink="navy" className="text-[27px]">Same me. More opportunities.</Handwritten>
      </Box>
      <Box x={52} y={110} w={40} h={44} z={10}><SparkBurst className="h-full w-full text-v2-green" /></Box>
      <Box x={-70} y={262} w={44} h={70} z={10}><Confetti className="h-full w-full rotate-12 text-v2-green" /></Box>
      <Box x={206} y={300} w={38} h={38} z={10}><SparkBurst className="h-full w-full rotate-[200deg] text-v2-green" /></Box>
      <Box x={552} y={104} w={34} h={34} z={10}><SparkBurst className="h-full w-full text-v2-green" /></Box>
    </>
  );
}
