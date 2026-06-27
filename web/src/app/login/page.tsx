import AuthScreen from "@/components/auth/AuthScreen";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthScreen mode="login" next={next} />;
}
