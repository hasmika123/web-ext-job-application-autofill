import type { ReactNode } from "react";

/** Page body grid: a main column + a right rail (the rail drops under the main column below `xl`). */
export default function RailLayout({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">{main}</div>
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-1">{rail}</div>
    </div>
  );
}
