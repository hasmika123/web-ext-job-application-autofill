import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import Analytics from "@/components/Analytics";
import { ToastProvider } from "@/components/ui";

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

const SITE_URL = "https://kiwiply.com";
const TITLE = "Kiwiply — one profile, every application";
const DESCRIPTION =
  "Build one job-application profile, manage your resumes, and track every application in one place. The Kiwiply browser extension fills applications for you on the page.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · Kiwiply",
  },
  description: DESCRIPTION,
  applicationName: "Kiwiply",
  // Favicon resolves from the App Router convention file `app/icon.svg`.
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
        <Analytics />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
