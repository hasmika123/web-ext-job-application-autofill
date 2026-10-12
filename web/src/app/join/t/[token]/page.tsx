import JoinPage from "@/components/org-join/JoinPage";

/** /join/t/<token>: the link in an invite email (O2.3). The token is the credential; everything else is Spring's. */
export default async function JoinByTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinPage link={{ kind: "token", token }} />;
}
