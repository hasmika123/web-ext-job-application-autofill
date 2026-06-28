import type { Metadata } from "next";
import AuthCardShell from "@/components/auth/AuthCardShell";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Set a new password",
  description: "Choose a new password for your Kiwiply account.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  return (
    <AuthCardShell>
      <ResetPasswordForm resetKey={key ?? ""} />
    </AuthCardShell>
  );
}
