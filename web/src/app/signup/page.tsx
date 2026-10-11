import type { Metadata } from "next";
import AuthScreen from "@/components/auth/AuthScreen";
import AuthTheme from "@/components/auth/AuthTheme";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthTheme>
      <AuthScreen mode="signup" next={next} />
    </AuthTheme>
  );
}
