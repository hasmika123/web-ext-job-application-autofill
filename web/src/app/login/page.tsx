import type { Metadata } from "next";
import AuthScreen from "@/components/auth/AuthScreen";
import AuthTheme from "@/components/auth/AuthTheme";
import { getDemoInfo } from "@/lib/demo-server";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // null (demo off, or the API unreachable) leaves the page exactly as it was.
  const demo = await getDemoInfo();
  return (
    <AuthTheme>
      <AuthScreen mode="login" next={next} demo={demo} />
    </AuthTheme>
  );
}
