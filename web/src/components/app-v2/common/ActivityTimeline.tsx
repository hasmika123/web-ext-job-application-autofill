import { cn } from "@kiwiply/ui";
import { TONE, type Tone } from "./tones";

/** Dot timeline ("Application Activity Timeline", "Recent Activity"). */
export default function ActivityTimeline({
  items,
  className,
}: {
  items: readonly { id: string; title: string; sub: string; when: string; tone: Tone }[];
  className?: string;
}) {
  return (
    <ol className={cn("relative space-y-3.5", className)}>
      <span aria-hidden className="absolute bottom-2 left-[4.5px] top-2 w-px bg-v2-line" />
      {items.map((it) => (
        <li key={it.id} className="relative flex items-start gap-3">
          <span className={cn("relative z-[1] mt-1.5 h-[10px] w-[10px] flex-none rounded-full ring-4 ring-white", TONE[it.tone].solid)} />
          <div className="min-w-0 flex-1 sm:flex sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-snug text-ink">{it.title}</p>
              <p className="text-[12px] leading-snug text-v2-muted">{it.sub}</p>
            </div>
            <p className="mt-0.5 flex-none text-[11.5px] leading-snug text-v2-muted sm:max-w-[84px] sm:text-right">{it.when}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
