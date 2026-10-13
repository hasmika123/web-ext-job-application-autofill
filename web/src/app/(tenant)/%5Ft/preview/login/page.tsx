import type { Metadata } from "next";
import { LoginPreviewFrame, PREVIEW_MESSAGE } from "@/components/ent/branding/LoginPreview";
import { getTenant } from "@/lib/tenant";

/**
 * The frame the Branding editor draws its live preview in (X2.18): the REAL BrandedLogin, inert, repainted from the draft the
 * editor posts to it (same origin only). It starts from the PUBLISHED branding so a slow editor never flashes someone else's
 * look. It carries no data the public login does not already show.
 */
export const metadata: Metadata = { title: "Sign-in preview", robots: { index: false, follow: false } };

export default async function LoginPreviewRoute() {
  const t = await getTenant();
  if (t.kind !== "TENANT") return null;
  const b = t.tenant.branding;
  return (
    <LoginPreviewFrame
      initial={{
        type: PREVIEW_MESSAGE,
        primary: b?.primary ?? "",
        secondary: b?.secondary ?? "",
        props: {
          name: t.tenant.displayName,
          logoUrl: b?.logoUrl ?? null,
          welcomeTitle: b?.welcomeTitle ?? null,
          welcomeMessage: b?.welcomeMessage ?? null,
          supportEmail: b?.supportEmail ?? null,
          featureChips: (b?.featureChips ?? []).filter(Boolean),
          microsoft: false,
        },
      }}
    />
  );
}
