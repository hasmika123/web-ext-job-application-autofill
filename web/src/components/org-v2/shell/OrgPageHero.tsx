import Image from "next/image";
import type { ReactNode } from "react";
import { SparkBurst } from "@kiwiply/ui";
import Handwritten from "@/components/marketing/Handwritten";
import { PageHero } from "@/components/app-v2/common";
import OrgChip from "./OrgChip";

/**
 * Hero used on every org page (APP-V2-SPEC §5): "Acme Corp Enterprise" chip, title + blue icon,
 * subtitle, and on the right the team banner art, green spark doodles, pastel blobs (inside
 * PageHero) and a handwritten navy note.
 */
export default function OrgPageHero({
  title,
  icon,
  subtitle,
  note,
}: {
  title: string;
  icon?: ReactNode;
  subtitle: string;
  note: string;
}) {
  return (
    <PageHero
      tone="blue"
      size="lg"
      iconPlacement="after"
      notePlacement="aside"
      title={title}
      icon={icon}
      subtitle={subtitle}
      eyebrow={<OrgChip className="px-2.5 py-1.5 text-[13px]" />}
      decor={
        <>
          <SparkBurst className="absolute left-[46%] top-5 hidden h-9 w-9 text-v2-green lg:block" />
          <SparkBurst className="absolute right-[7%] top-6 hidden h-10 w-10 rotate-90 text-v2-green xl:block" />
        </>
      }
      art={
        <Image
          src="/v2/app/org-team-banner.png"
          alt=""
          width={260}
          height={151}
          priority
          className="h-[170px] w-auto max-w-none"
        />
      }
      note={
        <Handwritten ink="navy" className="text-[24px] leading-[1.05] xl:text-[28px]">
          {note}
        </Handwritten>
      }
    />
  );
}
