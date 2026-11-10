"use client";

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};

/**
 * Renders its children at the end of `<body>`. A sheet or dialog opened FROM INSIDE a side sheet has to live outside it:
 * the sheet slides with a CSS transform, and a `position: fixed` child of a transformed element is positioned against
 * that element, not the screen. Client only (nothing on the server, so no markup mismatch).
 */
export default function BodyPortal({ children }: { children: ReactNode }) {
  const client = useSyncExternalStore(subscribe, () => true, () => false);
  return client ? createPortal(children, document.body) : null;
}
