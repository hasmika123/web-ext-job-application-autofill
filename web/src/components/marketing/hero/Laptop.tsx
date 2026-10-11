import { cn } from "@kiwiply/ui";
import { Mascot } from "../media";

/**
 * Simple CSS laptop silhouette (rounded light-grey lid with a darker base line) carrying a small
 * mascot sticker, as in the slide-1 board. Size it from outside with `className` (`h-* w-*`).
 */
export default function Laptop({ className, sticker = 40, stickerTop = 30 }: { className?: string; sticker?: number; stickerTop?: number }) {
  return (
    <div aria-hidden className={cn("relative", className)}>
      <div className="absolute inset-0 rounded-t-[18px] bg-gradient-to-b from-[#EEF1F6] to-[#CBD2DD] shadow-[0_-4px_18px_rgba(27,31,94,.10)] ring-1 ring-inset ring-white/70" />
      <div className="absolute inset-x-[-4%] bottom-0 h-[7%] rounded-full bg-[#AEB6C4]" />
      <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: sticker, height: sticker, top: `${stickerTop}%` }}>
        <Mascot pose="wave" eager className="h-full w-full" />
      </div>
    </div>
  );
}
