import Image from "next/image";
import { cn } from "@/lib/cn";

// The CSS-rendered brand marks are shared with the extension — single source in @kiwiply/ui.
export { Mark, Wordmark, BrandLockup } from "@kiwiply/ui";
export type { MarkProps, WordmarkProps, BrandLockupProps } from "@kiwiply/ui";

// Intrinsic dimensions of /public/logo.svg (the kiwi + "kiwiply" lockup).
const LOGO_W = 1713;
const LOGO_H = 488;

export interface LogoProps {
  /** Rendered height in px (width scales to the lockup's aspect ratio). Default 30. */
  height?: number;
  className?: string;
  priority?: boolean;
}

/** Full Kiwiply lockup (kiwi mark + wordmark) for light surfaces — header, sidebar, footer.
 *  Web-only (renders /public/logo.svg via next/image); the CSS marks above are the shared ones. */
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

export default Logo;
