"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

const LINK_FAILED =
  "로그인 링크를 열지 못했습니다. 링크를 요청한 것과 같은 브라우저에서 메일을 열고 링크를 눌러 주세요. (휴대폰 메일 앱에서 누르면 안 될 수 있습니다)";

export function LoginForm({ next, error: initialError }: { next: string; error: string | null }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(initialError ? "error" : "idle");
  const [error, setError] = useState(
    initialError === "email"
      ? "이 이메일로는 이 연구실의 Strata에 들어올 수 없습니다. 관리자에게 문의해 주세요."
      : initialError === "link"
        ? LINK_FAILED
        : initialError
          ? "로그인하지 못했습니다. 다시 시도해 주세요."
          : "",
  );
  // Supabase는 만료된 링크 같은 오류를 주소의 # 뒤에 붙여 돌려보낸다
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    if (h.get("error")) {
      setState("error");
      setError(h.get("error_code") === "otp_expired" ? "로그인 링크가 만료됐거나 이미 사용됐습니다. 아래에서 새 링크를 받아 주세요." : LINK_FAILED);
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);
  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const google = async () => {
    const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (error) {
      setState("error");
      setError("Google 로그인을 시작하지 못했습니다. 관리자에게 Google 로그인 설정을 확인해 달라고 해 주세요.");
    }
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return setError("이메일을 확인해 주세요");
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } });
    if (error) {
      setState("error");
      setError("로그인 링크를 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    } else setState("sent");
  };

  return (
    <div className="login">
      <form className="box" onSubmit={sendLink}>
        <h1>Strata</h1>
        <p>연구 주제별로 논문을 찾고, 초록을 요약해 쌓아 둡니다.</p>
        <button type="button" className="btn primary" onClick={google}>
          Google 계정으로 계속
        </button>
        <div className="or">또는</div>
        <label className="meta" htmlFor="lemail">
          이메일
        </label>
        <input id="lemail" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className="btn" disabled={state === "sending"}>
          {state === "sending" ? "보내는 중…" : "로그인 링크 받기"}
        </button>
        {state === "sent" && <p style={{ color: "var(--good)" }}>{email}로 로그인 링크를 보냈습니다. 메일함을 확인해 주세요.</p>}
        {error && state !== "sent" && <p style={{ color: "var(--warn)" }}>{error}</p>}
        <p>처음 로그인하면 설정에서 내 Anthropic API 키를 등록합니다.</p>
      </form>
    </div>
  );
}
