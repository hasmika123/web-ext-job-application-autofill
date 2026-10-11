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
 */

/** True when `public/<rel>` exists. `public/` sits next to the server in the standalone build. */
function publicFileExists(rel: string): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), "public", rel));
  } catch {
    return false;
  }
}

/* ── Mascot ───────────────────────────────────────────────────────────────────────── */

export type MascotPose = "wave" | "laptop" | "headphones" | "envelope" | "plane";

export interface MascotProps {
  pose: MascotPose;
  /** Size / position classes. The default box is square; override both `h-*` and `w-*`. */
  className?: string;
}

export function Mascot({ pose, className }: MascotProps) {
  const rel = `v2/mascot-${pose}.png`;
  const box = cn("relative block flex-none", className ?? "h-40 w-40");
  if (publicFileExists(rel)) {
    return (
      <span aria-hidden className={box}>
        <Image
          src={`/${rel}`}
          alt=""
          fill
          sizes="(min-width: 1024px) 240px, 160px"
          className="object-contain drop-shadow-[0_12px_20px_rgba(27,31,94,0.18)]"
        />
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
  | "about-portrait"
  | "about-team"
  | "org-team";

export interface PhotoProps {
  id: PhotoId;
  /** Real description of the photo (shown only when the file exists). */
  alt: string;
  /** Box classes — give it an aspect ratio / height (default `aspect-[4/3] w-full`). */
  className?: string;
  /** `sizes` hint for next/image (default: full width on mobile, half on desktop). */
  sizes?: string;
  /** Load eagerly (hero image above the fold). */
  priority?: boolean;
}

export function Photo({
  id,
  alt,
  className,
  sizes = "(min-width: 1024px) 560px, 100vw",
  priority,
}: PhotoProps) {
  const rel = ["jpg", "webp"].map((ext) => `v2/${id}.${ext}`).find(publicFileExists);
  const box = cn("relative block overflow-hidden", className ?? "aspect-[4/3] w-full");
  if (rel) {
    return (
      <div className={box}>
        <Image src={`/${rel}`} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={cn(box, "bg-gradient-to-br from-v2-lime-soft via-white to-v2-blue-soft")}
    >
      <SparkBurst className="absolute right-[12%] top-[14%] h-10 w-10 text-v2-lime-deep/40" />
    </div>
  );
}
