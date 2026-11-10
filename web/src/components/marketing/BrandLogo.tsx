import Image from "next/image";
import { cn } from "@kiwiply/ui";

// Intrinsic size of /public/v2/logo-v2*.png (mascot bird + "kiwiply" wordmark).
const LOGO_W = 764;
const LOGO_H = 234;

export interface BrandLogoProps {
  /** `light` = black wordmark for light surfaces; `dark` = white wordmark for the navy footer. */
  tone?: "light" | "dark";
  /** Rendered height in px (width follows the 764:234 ratio). Default 36. Ignored when
   *  `className` sets its own height (e.g. `h-[30px] md:h-9` for a responsive size). */
  height?: number;
  className?: string;
  priority?: boolean;
}

/** Landing-v2 brand lockup (mascot + wordmark). Server component. The signed-in app keeps the
 *  old `Logo` from `@/components/ui`. */
export default function BrandLogo({ tone = "light", height = 36, className, priority }: BrandLogoProps) {
  const width = Math.round((height * LOGO_W) / LOGO_H);
  return (
    <Image
      src={tone === "dark" ? "/v2/logo-v2-dark.png" : "/v2/logo-v2.png"}
      alt="Kiwiply"
      width={width}
      height={height}
      priority={priority}
      className={cn("block w-auto max-w-none", className ?? "h-auto")}
      style={className ? undefined : { height, width }}
    />
  );
}
