import Script from "next/script";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";

/**
 * Loads Google Analytics 4 (gtag.js) — but only when NEXT_PUBLIC_GA_MEASUREMENT_ID is set.
 * Renders nothing otherwise, so local/preview builds and unconfigured deploys send no
 * analytics at all. Mounted once in the root layout. The measurement ID is public; no
 * secret is involved (gtag.js doesn't use the Measurement Protocol api_secret).
 */
export default function Analytics() {
  if (!GA_MEASUREMENT_ID) return null;
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
