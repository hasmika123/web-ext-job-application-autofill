import AuthScreen from "@/components/auth/AuthScreen";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthScreen mode="signup" next={next} />;
}
