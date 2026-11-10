import { LayoutGridIcon, MailIcon, SparklesIcon, TargetIcon, type IconProps } from "@kiwiply/ui";
import type { ComponentType } from "react";

/**
 * The white four-tile strip under slide 1 (board: hero-slide-copilot-with-feature-strip). Rendered by
 * the client carousel (no server-only imports here), faded in only while slide 1 is active.
 */

const ITEMS: { title: string; text: string; Icon: ComponentType<IconProps>; tile: string }[] = [
  { title: "Save hours of work", text: "Let AI handle repetitive application tasks.", Icon: SparklesIcon, tile: "bg-[#FFF3D9] text-[#F5A623]" },
  { title: "Get better job matches", text: "Find opportunities aligned with your skills and goals.", Icon: TargetIcon, tile: "bg-[#E4F7E8] text-[#20B33D]" },
  { title: "Stay on top, effortlessly", text: "Track applications and interview updates in one place.", Icon: MailIcon, tile: "bg-[#E6F0FF] text-[#1E6FF5]" },
  { title: "Organize your entire search", text: "Keep your applications, notes, and next steps in sync.", Icon: LayoutGridIcon, tile: "bg-[#FDE6F5] text-[#E040A0]" },
];

export default function HeroFeatureStrip() {
  return (
    <ul className="grid grid-cols-2 gap-y-1 rounded-[28px] border border-white/80 bg-white/95 py-3 shadow-[0_22px_60px_rgba(27,31,94,.14)] backdrop-blur min-[900px]:grid-cols-4 min-[900px]:divide-x min-[900px]:divide-[#E8ECF5] min-[900px]:gap-y-0 min-[900px]:py-3.5 min-[1100px]:rounded-[32px] min-[1100px]:py-5">
      {ITEMS.map((it) => (
        <li key={it.title} className="flex items-center gap-3 px-4 py-2 min-[900px]:gap-2.5 min-[900px]:px-3 min-[900px]:py-0 min-[1100px]:gap-3.5 min-[1100px]:px-5">
          <span aria-hidden className={`grid h-[44px] w-[44px] flex-none place-items-center rounded-[14px] min-[900px]:h-[38px] min-[900px]:w-[38px] min-[1100px]:h-[58px] min-[1100px]:w-[58px] min-[1100px]:rounded-[18px] ${it.tile}`}>
            <it.Icon className="h-6 w-6 min-[1100px]:h-8 min-[1100px]:w-8" />
          </span>
          <span>
            <span className="block text-[14px] font-bold leading-tight min-[900px]:text-[13px] min-[1100px]:text-[16.5px] text-v2-navy">{it.title}</span>
            <span className="mt-0.5 block text-[12.5px] leading-snug min-[900px]:text-[11.5px] min-[1100px]:mt-1 min-[1100px]:text-[14px] text-v2-ink-soft">{it.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
