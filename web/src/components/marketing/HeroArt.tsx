import Handwritten from "./Handwritten";
import { Mascot, Photo } from "./media";
import type { HeroSlide } from "./hero-slides";
import ArtAutopilot from "./hero/ArtAutopilot";
import ArtCopilot from "./hero/ArtCopilot";
import ArtCopilotAlt from "./hero/ArtCopilotAlt";
import ArtOrganizations from "./hero/ArtOrganizations";
import ArtStudents from "./hero/ArtStudents";
import Laptop from "./hero/Laptop";
import { Sticky } from "./hero/parts";

/**
 * Art side of one hero slide (server component: `Photo` / `Mascot` read the filesystem).
 *  - below md (phones): a simple stack - the handwritten note top-left, the sticky note tucked
 *    top-right (slide 1), the person cutout centred (~75-80% wide), the mascot overlapping its
 *    lower right. No cards (the boards' phone hero has none).
 *  - md and up: the full composition on an 820x700 px design canvas (`.hero-art-cell` /
 *    `.hero-art-stage`, globals.css) scaled fluidly to the width of the carousel's art column, so
 *    the person stays flush with the hero's bottom edge at every width. Each slide's stage lives in
 *    `hero/Art*.tsx`.
 * `HeroCarousel` (client) receives the rendered node as a prop, so it never imports media.tsx.
 */

function Stage({ slide, priority }: { slide: HeroSlide; priority: boolean }) {
  switch (slide.id) {
    case "copilot":
      return <ArtCopilot priority={priority} />;
    case "copilot-alt":
      return <ArtCopilotAlt priority={priority} />;
    case "autopilot":
      return <ArtAutopilot priority={priority} />;
    case "students":
      return <ArtStudents priority={priority} />;
    case "organizations":
      return <ArtOrganizations priority={priority} />;
  }
}

function MobileArt({ slide }: { slide: HeroSlide }) {
  const m = slide.mobile;
  return (
    <div className="relative mx-auto mt-3 w-full max-w-[400px] pt-[72px] md:hidden">
      <Handwritten ink="navy" className="pointer-events-none absolute left-1 top-3 z-10 w-[46%] -rotate-6 text-[22px]">
        {m.note}
      </Handwritten>
      {m.sticky && (
        <Sticky className="absolute right-0 top-4 z-20 w-[34%] rotate-3 rounded-[5px] px-3 py-2 text-[17px]">{m.sticky}</Sticky>
      )}
      <div className="relative z-10 mx-auto" style={{ width: `${m.photoWidth}%` }}>
        <Photo id={m.photo} alt={m.photoAlt} className="w-full" sizes="320px" edgeFade={slide.id === "students" ? [8, 6] : undefined} />
        {m.laptop && (
          <div className="absolute bottom-[-3%] left-[4%] z-30 w-[64%]">
            <Laptop className="aspect-[2.4/1] w-full" sticker={26} stickerTop={34} />
          </div>
        )}
      </div>
      {m.mascot && (
        <Mascot pose={m.mascot} className="absolute bottom-0 right-[3%] z-20 h-[96px] w-[92px]" />
      )}
    </div>
  );
}

export default function HeroArt({ slide, priority = false }: { slide: HeroSlide; priority?: boolean }) {
  return (
    <>
      <MobileArt slide={slide} />
      {/* md and up: the cell is a size container filling the carousel's art column; the stage's
          height and the canvas scale follow its width (globals.css). */}
      <div className="hero-art-cell pointer-events-none relative hidden md:block">
        <div className="hero-art-stage">
          <div className="hero-art-canvas">
            <Stage slide={slide} priority={priority} />
          </div>
        </div>
      </div>
    </>
  );
}
