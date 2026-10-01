"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** 계정은 관리자가 Supabase에서 만들어 준다. 여기서는 이메일과 비밀번호로 로그인만 한다. */
export function LoginForm({ next, error: initialError }: { next: string; error: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError === "email" ? "이 계정은 이 연구실의 Strata를 쓸 수 없습니다. 관리자에게 문의해 주세요." : "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.includes("@") || !password) return setError("이메일과 비밀번호를 입력해 주세요.");
    setBusy(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      setError(
        /invalid login credentials/i.test(error.message)
          ? "이메일 또는 비밀번호가 맞지 않습니다. 계정이 없다면 관리자에게 만들어 달라고 해 주세요."
          : /email not confirmed/i.test(error.message)
            ? "아직 승인되지 않은 계정입니다. 관리자에게 계정 확인(Confirm)을 부탁해 주세요."
            : "로그인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
      );
      return;
    }
    router.replace(next.startsWith("/") && next !== "/login" ? next : "/");
    router.refresh();
  };

  return (
    <div className="login">
      <form className="box" onSubmit={submit}>
        <h1>Strata</h1>
        <p>연구 주제별로 논문을 찾고, 초록을 요약해 쌓아 둡니다.</p>
        <label className="meta" htmlFor="lemail">
          이메일
        </label>
        <input id="lemail" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        <label className="meta" htmlFor="lpw">
          비밀번호
        </label>
        <input id="lpw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "로그인 중…" : "로그인"}
        </button>
        {error && <p style={{ color: "var(--warn)" }}>{error}</p>}
        <p>계정은 관리자가 만들어 줍니다. 처음 로그인한 뒤 설정에서 비밀번호를 바꿀 수 있습니다.</p>
      </form>
    </div>
  );
}
