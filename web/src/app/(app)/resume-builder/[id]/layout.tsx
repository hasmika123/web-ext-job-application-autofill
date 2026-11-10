import type { ReactNode } from "react";

/**
 * The editor is full-bleed (DESIGN 1): no app sidebar, no top nav. `AppShell` (in the parent (app)
 * layout) steps aside for `/resume-builder/<id>`, so this wrapper is the whole viewport: the editor's
 * own top bar on top, the columns below it scrolling independently.
 */
export default function EditorLayout({ children }: { children: ReactNode }) {
  return <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-v2-canvas">{children}</div>;
}
