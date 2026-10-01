import { LoginForm } from "./LoginForm";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return <LoginForm next={sp.next ?? "/"} error={sp.error ?? null} />;
}
