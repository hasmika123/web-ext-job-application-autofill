import JoinPage from "@/components/org-join/JoinPage";

/** /join/<slug>/<code>: the shared link or QR of a cohort kickoff (O2.3). A slug that is not the code's org is a bad link. */
export default async function JoinByCodePage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  return <JoinPage link={{ kind: "code", slug, code }} />;
}
