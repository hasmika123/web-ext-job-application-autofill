import { redirect } from "next/navigation";

/** Job detail now lives in the Job Search side panel (app v3): `/jobs/<id>` opens it. */
export default async function JobDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/jobs?job=${encodeURIComponent(id)}`);
}
