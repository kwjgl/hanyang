/**
 * 가입·로그인을 연구실 사람으로 제한한다.
 * ALLOWED_EMAILS="me@lab.kr,@hanyang.ac.kr" 처럼 이메일 또는 @도메인을 쉼표로 적는다. 비워 두면 누구나 가입할 수 있다.
 */
export function isAllowedEmail(email: string | null | undefined, rule = process.env.ALLOWED_EMAILS ?? ""): boolean {
  const entries = rule
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!entries.length) return true;
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  return entries.some((x) => (x.startsWith("@") ? e.endsWith(x) : e === x));
}
