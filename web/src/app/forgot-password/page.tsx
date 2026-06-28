import type { Metadata } from "next";
import AuthCardShell from "@/components/auth/AuthCardShell";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Request a link to reset your Kiwiply password.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthCardShell>
      <ForgotPasswordForm />
    </AuthCardShell>
  );
}
