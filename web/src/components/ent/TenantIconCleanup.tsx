"use client";

import { useEffect } from "react";

/**
 * D15 (2026-10-16 audit): the platform's own `app/favicon.ico` / `icon.png` convention files add their `<link rel="icon">` to every page, so a tenant page had TWO
 * icon links (Kiwiply's first). The tenant's own link stays; this disarms the platform ones once the page mounts (the browser re-reads the remaining link). The
 * organization's links are the same-origin `/tenant-assets/...` routes or the blank data icon; the platform's are the bare convention paths.
 */
export function isPlatformIconHref(href: string | null): boolean {
  if (!href) return false;
  const path = href.split("?")[0];
  return path === "/favicon.ico" || path === "/icon.png" || path === "/apple-icon.png" || /^\/icon\.[a-z0-9]+\.(png|ico)$/.test(path);
}

function disarmPlatformIcons(): void {
  const links = Array.from(document.head.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]'));
  if (!links.some((l) => !isPlatformIconHref(l.getAttribute("href")))) return; // never leave the page with no icon at all
  // disarm rather than remove: the framework owns these nodes and puts a removed one back; an unknown rel is ignored by the browser
  for (const l of links) if (isPlatformIconHref(l.getAttribute("href"))) l.setAttribute("rel", "x-platform-icon-disabled");
}

export default function TenantIconCleanup() {
  useEffect(() => {
    disarmPlatformIcons();
    // the framework may add (or re-add) its icon links after this effect ran (metadata streams in late): watch the head
    const obs = new MutationObserver(() => disarmPlatformIcons());
    obs.observe(document.head, { childList: true });
    return () => obs.disconnect();
  }, []);
  return null;
}
