import type { Metadata } from "next";
import AuthScreen from "@/components/auth/AuthScreen";
import AuthTheme from "@/components/auth/AuthTheme";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthTheme>
      <AuthScreen mode="login" next={next} />
    </AuthTheme>
  );
}
