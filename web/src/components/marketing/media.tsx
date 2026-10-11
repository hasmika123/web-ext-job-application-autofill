import fs from "node:fs";
import path from "node:path";
import Image from "next/image";
import { Mark, SparkBurst, cn } from "@kiwiply/ui";

/**
 * Mascot + photo slots for the v2 marketing pages (spec §3.3). The artwork is supplied by the
 * user and dropped into `web/public/v2/` (see that folder's README). Until a file exists each
 * slot renders a graceful fallback with the SAME box, so layout never shifts and the pages ship
 * complete without any image. Server components: the existence check runs on the server
 * (static pages evaluate it at build time, so a newly added file ships with the next build).
 *
 * V2.3b: the shipped art is transparent PNG cutouts extracted from the design boards. `Photo`
 * renders a PNG as a cutout (no panel, no position of its own, `object-contain` bottom-anchored,
 * never wider than the file's native width) and keeps the cropped-photo treatment for jpg / webp.
 */

/** True when `public/<rel>` exists. `public/` sits next to the server in the standalone build. */
function publicFileExists(rel: string): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), "public", rel));
  } catch {
    return false;
  }
}

/** Width x height of a PNG, read from its IHDR chunk (bytes 16-23). Null when unreadable. */
function pngSize(rel: string): { w: number; h: number } | null {
  try {
    const fd = fs.openSync(path.join(process.cwd(), "public", rel), "r");
    try {
      const head = Buffer.alloc(24);
      fs.readSync(fd, head, 0, 24, 0);
      const w = head.readUInt32BE(16);
      const h = head.readUInt32BE(20);
      return w > 0 && h > 0 ? { w, h } : null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

/** Horizontal alpha mask that fades the left / right edges (percent of width) of a cutout. */
function fadeStyle(edge?: [number, number], top?: number, bottom?: number): React.CSSProperties {
  const layers: string[] = [];
  if (edge) layers.push(`linear-gradient(to right, transparent 0, #000 ${edge[0]}%, #000 ${100 - edge[1]}%, transparent 100%)`);
  if (top) layers.push(`linear-gradient(to bottom, transparent 0, #000 ${top}%)`);
  if (bottom) layers.push(`linear-gradient(to top, transparent 0, #000 ${bottom}%)`);
  const mask = layers.join(",");
  return { maskImage: mask, WebkitMaskImage: mask, maskComposite: "intersect", WebkitMaskComposite: "source-in" };
}

/* ── Mascot ───────────────────────────────────────────────────────────────────────── */

export type MascotPose = "wave" | "laptop" | "headphones" | "envelope" | "plane" | "clap" | "peek";

export interface MascotProps {
  pose: MascotPose;
  /**
   * Size AND position classes (`absolute bottom-0 right-0 h-28 w-28`, `md:absolute`, ...). The
   * default box is square; give both `h-*` and `w-*`. The component adds no position of its own
   * (the image sits in an inner box), so the caller's `absolute` / `relative` always applies.
   * Source art is ~210px wide: keep the box at 220px or less.
   */
  className?: string;
  /** Load without lazy-loading (hero carousel slides that are not showing yet). */
  eager?: boolean;
}

export function Mascot({ pose, className, eager }: MascotProps) {
  const rel = `v2/mascot-${pose}.png`;
  const box = cn("block flex-none", className ?? "h-40 w-40");
  if (publicFileExists(rel)) {
    return (
      <span aria-hidden className={box}>
        <span className="relative block h-full w-full">
          <Image
            src={`/${rel}`}
            alt=""
            fill
            sizes="(min-width: 768px) 220px, 160px"
            loading={eager ? "eager" : undefined}
            className="object-contain object-bottom drop-shadow-[0_10px_16px_rgba(27,31,94,0.16)]"
          />
        </span>
      </span>
    );
  }
  return (
    <span aria-hidden className={cn(box, "grid place-items-center")}>
      <span className="grid aspect-square h-[78%] place-items-center rounded-full bg-v2-lime shadow-[0_12px_24px_rgba(27,31,94,0.16)]">
        <Mark size={44} />
      </span>
    </span>
  );
}

/* ── Photo ────────────────────────────────────────────────────────────────────────── */

export type PhotoId =
  | "hero-individual"
  | "hero-student"
  | "hero-team"
  | "hero-copilot"
  | "hero-headphones"
  | "about-portrait"
  | "about-team"
  | "org-team";

export interface PhotoProps {
  id: PhotoId;
  /** Real description of the photo (shown only when the file exists). */
  alt: string;
  /**
   * Box classes. Cropped photos (jpg / webp) and the missing-file fallback need an aspect ratio
   * (default `aspect-[4/3] w-full`). A PNG cutout sizes itself: set only its WIDTH (`w-[70%]`) and, if
   * needed, its position (`absolute bottom-0 ...`); height follows the file's own aspect ratio and
   * it is capped at the native width.
   */
  className?: string;
  /** `sizes` hint for next/image (default: full width on mobile, half on desktop). */
  sizes?: string;
  /** Preload + load eagerly (the hero image above the fold). */
  priority?: boolean;
  /** Load without lazy-loading, no preload (carousel slides that are not showing yet). */
  eager?: boolean;
  /**
   * PNG cutouts only: fade the left / right edges to transparent, as percentages of the width
   * (`[10, 3]`). Hides hard crop edges left over from the board extraction; the bottom stays solid.
   */
  edgeFade?: [number, number];
  /** PNG cutouts only: fade the TOP edge to transparent over this percent of the height. Softens a flat crop through the heads (hero-team.png). */
  topFade?: number;
  /** PNG cutouts only: fade the BOTTOM edge to transparent over this percent of the height (hides a flat crop that would otherwise show). */
  bottomFade?: number;
}

export function Photo({
  id,
  alt,
  className,
  sizes = "(min-width: 1024px) 560px, 100vw",
  priority,
  eager,
  edgeFade,
  topFade,
  bottomFade,
}: PhotoProps) {
  const rel = ["png", "webp", "jpg"].map((ext) => `v2/${id}.${ext}`).find(publicFileExists);
  const size = rel?.endsWith(".png") ? pngSize(rel) : null;
  if (rel && size) {
    // Transparent cutout: no panel, no crop, no position of its own; capped at its native width.
    return (
      <div className={cn("block", className ?? "w-full")} style={{ maxWidth: size.w }}>
        <Image
          src={`/${rel}`}
          alt={alt}
          width={size.w}
          height={size.h}
          sizes={sizes}
          priority={priority}
          loading={eager && !priority ? "eager" : undefined}
          className="block h-auto w-full object-contain object-bottom"
          style={edgeFade || topFade || bottomFade ? fadeStyle(edgeFade, topFade, bottomFade) : undefined}
        />
      </div>
    );
  }
  // Cropped photo / fallback panel: needs an aspect ratio; cutout-style callers pass only a width.
  const box = cn(
    "relative block overflow-hidden",
    className ?? "w-full",
    !className?.includes("aspect-") && "aspect-[4/3]",
  );
  if (rel) {
    return (
      <div className={box}>
        <Image src={`/${rel}`} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }
  return (
    <div aria-hidden className={cn(box, "bg-gradient-to-br from-v2-lime-soft via-white to-v2-blue-soft")}>
      <SparkBurst className="absolute right-[12%] top-[14%] h-10 w-10 text-v2-lime-deep/40" />
    </div>
  );
}
