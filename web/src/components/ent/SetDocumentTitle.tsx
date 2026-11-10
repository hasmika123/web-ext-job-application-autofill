"use client";

import { useEffect } from "react";

/**
 * Sets the tab title from the client. A tenant `not-found` page cannot reliably set it through metadata (the framework keeps the layout's title, which the
 * platform's root template then prefixes with "Kiwiply | "), so the organization's own 404 sets its title here (D15, 2026-10-16 audit).
 */
export default function SetDocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}
