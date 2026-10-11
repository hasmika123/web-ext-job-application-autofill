import type { ReactNode } from "react";
import { HeroArt, PageHero } from "@/components/app-v2/common";
import type { AppArtName } from "@/components/app-v2/common";

/**
 * LOCAL stand-in for agent V3-A's shared `HeroBand` (QA swaps this import for the real one).
 * Soft lime-to-blue band: title, one-line subtitle, optional actions, and a mascot (with an
 * optional handwritten sticky note) at the right.
 */
export default function HeroBand({
  title,
  subtitle,
  mascot,
  note,
  actions,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  mascot: AppArtName;
  note?: string;
  actions?: ReactNode;
}) {
  return <PageHero title={title} subtitle={subtitle} actions={actions} art={<HeroArt mascot={mascot} note={note} mascotHeight={112} />} />;
}
