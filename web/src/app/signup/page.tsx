import AuthScreen from "@/components/auth/AuthScreen";
import AuthTheme from "@/components/auth/AuthTheme";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthTheme>
      <AuthScreen mode="signup" next={next} />
    </AuthTheme>
  );
}
