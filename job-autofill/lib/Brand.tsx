/**
 * Real Kiwiply brand marks for the extension surfaces (popup / options / side panel).
 *
 * Unlike @kiwiply/ui's CSS `BrandLockup` (which needs the Fraunces display font — not bundled
 * in the extension, so its wordmark falls back to a generic serif), this renders the ACTUAL
 * bundled logo artwork via `chrome.runtime.getURL`, exactly like the on-page review panel
 * (filler.js). Two <img>s are stacked and toggled by the `.dark` class so the charcoal "ply"
 * never vanishes on dark surfaces. Extension-only (depends on chrome.runtime) — the web app
 * keeps its own next/image `Logo`.
 */
import type { CSSProperties } from "react";

const url = (p: string) =>
  typeof chrome !== "undefined" && chrome.runtime?.getURL ? chrome.runtime.getURL(p) : "";

export interface BrandLogoProps {
  /** Rendered height in px (width scales to the lockup's aspect ratio). Default 24. */
  height?: number;
  className?: string;
}

/** Full Kiwiply lockup (kiwi mark + wordmark) — the real artwork, light/dark aware. */
export function BrandLogo({ height = 24, className = "" }: BrandLogoProps) {
  const style: CSSProperties = { height, width: "auto" };
  return (
    <span className={`inline-flex items-center ${className}`} aria-label="Kiwiply">
      <img src={url("icons/logo.png")} alt="Kiwiply" className="block w-auto dark:hidden" style={style} />
      <img src={url("icons/logo-dark-mode.png")} alt="Kiwiply" className="hidden w-auto dark:block" style={style} />
    </span>
  );
}

/** Kiwi mark only (the disc + check) — the real artwork, for tight headers. */
export function BrandMark({ height = 24, className = "" }: BrandLogoProps) {
  return (
    <img
      src={url("icons/logo-icon.png")}
      alt="Kiwiply"
      className={`block ${className}`}
      style={{ height, width: height }}
    />
  );
}
