import Script from "next/script";
import { GA_MEASUREMENT_ID, analyticsEnabled } from "@/lib/analytics";

/**
 * Loads Google Analytics 4 (gtag.js) — but only when analytics is BOTH configured (a
 * measurement ID is set) AND switched on (NEXT_PUBLIC_ANALYTICS_ENABLED=true). Renders
 * nothing otherwise, so a staged-but-off deploy (ID set, switch off) sends nothing.
 * Mounted once in the root layout. The measurement ID is public; no secret is involved.
 */
export default function Analytics() {
  if (!analyticsEnabled()) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
      </Script>
    </>
  );
}
