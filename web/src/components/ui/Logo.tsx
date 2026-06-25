import Image from "next/image";
import { cn } from "@/lib/cn";

// Intrinsic dimensions of /public/logo.svg (the kiwi + "kiwiply" lockup).
const LOGO_W = 1293;
const LOGO_H = 383;

export interface LogoProps {
  /** Rendered height in px (width scales to the lockup's aspect ratio). Default 30. */
  height?: number;
  className?: string;
  priority?: boolean;
}

/** Full Kiwiply lockup (kiwi mark + wordmark) for light surfaces — header, sidebar, footer. */
export function Logo({ height = 30, className, priority }: LogoProps) {
  const width = Math.round((height * LOGO_W) / LOGO_H);
  return (
    <Image
      src="/logo.svg"
      alt="Kiwiply"
      width={width}
      height={height}
      priority={priority}
      className={cn("block h-auto w-auto", className)}
      style={{ height, width }}
    />
  );
}

export interface MarkProps {
  /** Diameter in px. Default 26. */
  size?: number;
  className?: string;
}

/**
 * Kiwi mark only (CSS reproduction of the prototype `.kmark`): brown disc, lime
 * inner disc, charcoal check. For favicon-collapsed sidebar / dark surfaces where
 * the wordmark's charcoal "ply" would vanish.
 */
export function Mark({ size = 26, className }: MarkProps) {
  const inset = Math.max(3, Math.round(size * 0.155));
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-block flex-none rounded-full bg-brown shadow-[inset_0_0_0_1px_rgba(0,0,0,.06)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute rounded-full bg-accent"
        style={{ inset }}
      />
      <span
        className="absolute inset-0 grid place-items-center font-extrabold text-on-accent"
        style={{ fontSize: Math.round(size * 0.46) }}
      >
        ✓
      </span>
    </span>
  );
}

export default Logo;
