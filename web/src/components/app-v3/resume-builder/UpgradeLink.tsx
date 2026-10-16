"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { useBuilderEnv } from "./builderEnv";

/**
 * The way to the Pro plan from a locked Resume Builder control. It follows the builder's environment: on kiwiply.com it goes to the pricing page;
 * inside an organization workspace (`upgradeHref` is null: the license decides, there is no Kiwiply plan to buy) it renders nothing, so a member of an
 * enterprise account is never sent to a Kiwiply page (docs/enterprise-v2/62 section 5).
 */
export default function UpgradeLink({ children, ...props }: Omit<ComponentProps<typeof Link>, "href">) {
  const href = useBuilderEnv().upgradeHref;
  if (href === null) return null;
  return (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}
