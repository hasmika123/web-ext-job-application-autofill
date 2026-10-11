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
    <ul className="grid grid-cols-4 divide-x divide-[#E8ECF5] rounded-[32px] border border-white/80 bg-white/95 py-5 shadow-[0_22px_60px_rgba(27,31,94,.14)] backdrop-blur">
      {ITEMS.map((it) => (
        <li key={it.title} className="flex items-center gap-3.5 px-5">
          <span aria-hidden className={`grid h-[58px] w-[58px] flex-none place-items-center rounded-[18px] ${it.tile}`}>
            <it.Icon className="h-8 w-8" />
          </span>
          <span>
            <span className="block text-[16.5px] font-bold leading-tight text-v2-navy">{it.title}</span>
            <span className="mt-1 block text-[14px] leading-snug text-v2-ink-soft">{it.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
