import type { ReactNode } from "react";
import { HeroArt, PageHero } from "../../app-v2/common";
import type { AppArtName } from "../../app-v2/common";

/**
 * LOCAL stand-in for agent V3-A's shared `HeroBand` (`app3a:`). Same contract: a soft lime-to-blue
 * wash, 120-150px tall, title + one-line subtitle, a mascot at the right with an optional
 * handwritten note. Built on the v2 `PageHero` so the look is identical; V3-QA swaps the import
 * for the shared one and deletes this folder.
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
  mascot?: AppArtName;
  note?: string;
  actions?: ReactNode;
}) {
  return (
    <PageHero
      title={title}
      subtitle={subtitle}
      actions={actions}
      art={mascot ? <HeroArt mascot={mascot} note={note} mascotHeight={112} /> : undefined}
    />
  );
}
