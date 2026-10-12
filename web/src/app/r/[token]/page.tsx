import "@kiwiply/ui/styles/resume.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DownloadIcon, Mark, PAGE_DIMENSIONS, PageFrame, ResumePreview, buttonVariants, sanitizeTheme } from "@kiwiply/ui";
import { fetchPublicResume } from "@/lib/public-resume";
import { clientIpFromHeaders } from "@/lib/rate-limit";

/**
 * The public, read-only page behind a resume share link (R3.11, DESIGN 8.7 / 9.9). No sign-in: the token in
 * the address is the credential, and the page shows exactly what that link grants - the resume, drawn by its
 * own template - and never the editor, the owner's account, AI, or anything else of theirs.
 *
 *  - never indexed: `noindex` here, `/r/` disallowed in robots.txt, and the API marks its answers `noindex` too;
 *  - never cached (`force-dynamic`, the API answers `no-store`) so a revoked link is gone on the next reload;
 *  - an unknown, revoked or expired link is the ordinary 404 page - the same one for every cause;
 *  - no Kiwiply chrome beyond a footer, no analytics of the visitor, no referrer sent onward;
 *  - Download only when the owner allowed it AND the stored PDF is current; otherwise "PDF being prepared".
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared resume",
  robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true },
  referrer: "no-referrer",
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await fetchPublicResume(token, clientIpFromHeaders(await headers()));

  if (result.kind === "missing") notFound();
  if (result.kind === "limited") {
    return (
      <main className="grid min-h-screen place-items-center bg-paper-2 px-4">
        <p role="status" className="max-w-sm text-center text-[15px] text-ink-soft">
          Too many requests. Please wait a minute and reload this page.
        </p>
      </main>
    );
  }
  if (result.kind === "error") throw new Error("Couldn't load the shared resume.");

  const { resume } = result;
  const theme = sanitizeTheme(resume.theme);
  const pageWidth = Math.round(PAGE_DIMENSIONS[theme.pageSize].widthIn * 96);

  return (
    <main className="min-h-screen bg-paper-2 px-3 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5">
        <PageFrame pageWidth={pageWidth} label="Shared resume">
          <ResumePreview doc={resume.doc} theme={resume.theme} templateId={resume.templateId} />
        </PageFrame>

        {resume.allowDownload && (
          <div className="flex justify-center">
            {resume.pdfReady ? (
              <a href={`/r/${token}/pdf`} className={buttonVariants("accent", "md")} rel="nofollow noreferrer">
                <DownloadIcon size={16} aria-hidden /> Download PDF
              </a>
            ) : (
              <p role="status" className="rounded-xl border border-line bg-paper px-4 py-2.5 text-[13.5px] text-ink-soft">
                PDF being prepared - reload in a moment.
              </p>
            )}
          </div>
        )}

        <footer className="flex items-center justify-center gap-2 pt-2 text-[12.5px] text-ink-soft">
          <Mark size={18} />
          <Link href="/" prefetch={false} rel="nofollow noreferrer" className="font-semibold hover:underline">
            Made with Kiwiply
          </Link>
        </footer>
      </div>
    </main>
  );
}
