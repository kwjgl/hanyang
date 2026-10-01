/**
 * Supabase 연결 값. 붙여넣을 때 흔히 생기는 실수(이름까지 함께 붙여넣기, 따옴표, 끝의 / 나 /rest/v1)는 알아서 바로잡는다.
 */
function clean(raw: string | undefined, name: string): string {
  let v = (raw ?? "").trim();
  if (v.startsWith(`${name}=`)) v = v.slice(name.length + 1).trim();
  v = v.replace(/^["']|["']$/g, "").trim();
  return v;
}

function cleanUrl(raw: string | undefined): string {
  let v = clean(raw, "NEXT_PUBLIC_SUPABASE_URL");
  v = v.replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, "");
  if (v && !/^https?:\/\//i.test(v) && /\.supabase\.co$/i.test(v)) v = `https://${v}`;
  return v;
}

export const env = {
  supabaseUrl: cleanUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
};

export interface ConfigCheck {
  id: "url" | "key" | "secret";
  label: string;
  ok: boolean;
  /** 막히는 문제인지 (암호화 비밀값은 로그인을 막지 않는다) */
  blocking: boolean;
  message: string;
}

export function checkConfig(): ConfigCheck[] {
  const url = env.supabaseUrl;
  let urlMsg = "";
  if (!url) urlMsg = "값이 비어 있습니다.";
  else {
    try {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) urlMsg = "https:// 로 시작해야 합니다.";
      else if (u.hostname.endsWith("supabase.com")) urlMsg = "Supabase 관리 화면 주소가 들어갔습니다. https://xxxx.supabase.co 형태의 Project URL을 넣어 주세요.";
    } catch {
      urlMsg = "주소 형식이 아닙니다. https://xxxx.supabase.co 형태로 넣어 주세요.";
    }
  }
  const key = env.supabaseAnonKey;
  let keyMsg = "";
  if (!key) keyMsg = "값이 비어 있습니다.";
  else if (key.startsWith("sb_secret_") || /service_role/.test(key)) keyMsg = "관리자용 secret 키가 들어갔습니다. Publishable key(sb_publishable_…) 또는 anon public 키로 바꿔 주세요.";
  else if (!key.startsWith("eyJ") && !key.startsWith("sb_publishable_")) keyMsg = "Supabase 키 형식이 아닙니다. sb_publishable_ 또는 eyJ 로 시작하는 키를 넣어 주세요.";
  const secret = (process.env.API_KEY_ENCRYPTION_SECRET ?? "").trim();
  return [
    { id: "url", label: "NEXT_PUBLIC_SUPABASE_URL (Supabase 주소)", ok: !urlMsg, blocking: true, message: urlMsg || "정상" },
    { id: "key", label: "NEXT_PUBLIC_SUPABASE_ANON_KEY (Supabase 키)", ok: !keyMsg, blocking: true, message: keyMsg || "정상" },
    {
      id: "secret",
      label: "API_KEY_ENCRYPTION_SECRET (암호화 비밀값)",
      ok: secret.length >= 32,
      blocking: false,
      message: secret.length >= 32 ? "정상" : "비어 있거나 32자보다 짧습니다. 로그인은 되지만 API 키를 저장할 수 없습니다.",
    },
  ];
}

export const isConfigured = () => checkConfig().every((c) => c.ok || !c.blocking);
