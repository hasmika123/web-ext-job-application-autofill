import type { ReactNode } from "react";
import { HeroArt, PageHero, type AppArtName } from "../../app-v2/common";

/**
 * LOCAL HeroBand for V3-B (same props as the shared one V3-A ships: title, subtitle, mascot, note,
 * actions). QA dedupes this against the shared `HeroBand`. It is a thin wrapper over the v2
 * `PageHero` (soft lime-to-blue wash, 20px radius) with the mascot and handwritten note at the right.
 */
export default function HeroBand({
  title,
  subtitle,
  mascot,
  note,
  actions,
  mascotHeight = 124,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  mascot?: AppArtName;
  note?: string;
  actions?: ReactNode;
  mascotHeight?: number;
}) {
  return (
    <PageHero
      title={title}
      subtitle={subtitle}
      actions={actions}
      art={mascot ? <HeroArt mascot={mascot} note={note} mascotHeight={mascotHeight} /> : undefined}
    />
  );
}
