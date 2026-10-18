import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import CookieConsent from "@/components/CookieConsent";
import BugReportWidget from "@/components/BugReportWidget";
import PlatformChrome from "@/components/PlatformChrome";
import { ToastProvider } from "@/components/ui";
import { SITE_URL } from "@/lib/site";

// Inter (body) + Fraunces (display) — both variable fonts; no weight needed.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const TITLE = "Kiwiply | Find jobs. Apply faster. Get hired.";
const DESCRIPTION =
  "Kiwiply matches you with roles, fills job applications for you to review, and tracks replies in your Gmail — one profile, one board, no auto-submit.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "Kiwiply | %s",
  },
  description: DESCRIPTION,
  applicationName: "Kiwiply",
  // Favicons resolve from the App Router convention files `app/favicon.ico`, `app/icon.png` and `app/apple-icon.png`.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Kiwiply",
    url: SITE_URL,
    type: "website",
    // og image resolves from the convention file `app/opengraph-image.tsx`.
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PlatformChrome>
          <CookieConsent />
        </PlatformChrome>
        <ToastProvider>{children}</ToastProvider>
        <PlatformChrome>
          <BugReportWidget />
        </PlatformChrome>
      </body>
    </html>
  );
}
