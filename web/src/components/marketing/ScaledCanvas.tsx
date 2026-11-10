import type { CSSProperties, ReactNode } from "react";
import { cn } from "@kiwiply/ui";

/**
 * Lays its children out on a fixed `width` x `height` px design canvas and scales the whole
 * composition to the width of the column it sits in (a size container; see `.sc-cell` in
 * globals.css). The stage's height follows the scale, so nothing below it has to know. Use it for
 * mocks that are compositions of absolutely placed cards (they cannot reflow, only shrink).
 * `className` goes on the cell: give it a `max-w-*` to stop the scale growing past a few percent
 * above 1x. The canvas is decorative/`role="img"` at the call site, never a landmark.
 */
export default function ScaledCanvas({
  width,
  height,
  className,
  children,
}: {
  width: number;
  height: number;
  className?: string;
  children: ReactNode;
}) {
  const style = { "--cw": width, "--ch": height } as CSSProperties;
  return (
    <div className={cn("sc-cell w-full", className)} style={style}>
      <div className="sc-stage">
        <div className="sc-canvas">{children}</div>
      </div>
    </div>
  );
}
