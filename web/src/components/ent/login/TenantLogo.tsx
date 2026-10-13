"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@kiwiply/ui";

/**
 * The organization's mark (X2.3). Loaded by host: `logoUrl` is the same-origin `/tenant-assets/logo?v=...` route of the
 * published branding (X2.13), never a Kiwiply asset and never another organization's.
 *
 * - The logo loads: ONLY the logo is shown (its alt text is the organization's name, announced once).
 * - There is no logo, or the image fails to load (404, network, a file the browser can not decode): a clean wordmark of the
 *   organization's display name, set in the body sans (a full fallback stack, so no glyph is ever an empty box) in the
 *   brand colour. The wordmark is text, so it can never render tofu for a character the font lacks the way a broken image's
 *   alt text can.
 * The image is not optimised by Next (its URL carries the cache-busting version and the file is re-encoded server side).
 */
export default function TenantLogo({
  name,
  logoUrl,
  size = "md",
  className,
}: {
  name: string;
  logoUrl?: string | null;
  size?: "md" | "lg";
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const height = size === "lg" ? 56 : 44;
  if (logoUrl && failedUrl !== logoUrl) {
    return (
      <span className={cn("inline-flex items-center", className)} data-tenant-logo="image">
        {/* width is a ceiling: the file keeps its own ratio (h-auto), the box only caps it */}
        <Image
          src={logoUrl}
          alt={name}
          width={height * 4}
          height={height}
          unoptimized
          priority
          onError={() => setFailedUrl(logoUrl)}
          className="h-auto w-auto max-w-[220px] object-contain"
          style={{ maxHeight: height }}
        />
      </span>
    );
  }
  return (
    <span
      data-tenant-logo="wordmark"
      className={cn(
        "inline-block max-w-full truncate font-body font-extrabold tracking-tight text-[var(--brand-700)]",
        size === "lg" ? "text-[34px] leading-[1.1]" : "text-[26px] leading-[1.1]",
        className,
      )}
    >
      {name}
    </span>
  );
}
