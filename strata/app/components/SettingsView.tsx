"use client";
import type { KciPingResult, KciTestRow } from "@/app/api/kci/test/route";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, downloadText, errMsg, toast } from "@/lib/client";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { PROVIDERS, type Provider, type PublicAi } from "@/lib/llm/meta";
import type { Field } from "@/lib/types";
import { FieldTag } from "./bits";

type Theme = "light" | "dark" | "system";

function applyTheme(t: Theme) {
  const r = document.documentElement;
  if (t === "system") r.removeAttribute("data-theme");
  else r.setAttribute("data-theme", t);
  try {
    localStorage.setItem("strata-theme", t);
  } catch {}
}

export function SettingsView(props: {
  name: string;
  email: string;
  ai: PublicAi;
  usage: { used: number; limit: number };
  fields: Field[];
  fieldCounts: Record<string, number>;
  paperIds: string[];
}) {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>("system");
  const [limit, setLimit] = useState(String(props.usage.limit));
  const [editLimit, setEditLimit] = useState(false);
  const [newField, setNewField] = useState({ name: "", description: "" });
  const [reclass, setReclass] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    try {
      const t = localStorage.getItem("strata-theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}
  }, []);

  const call = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) toast(done);
      router.refresh();
      return true;
    } catch (e) {
      toast(errMsg(e));
      return false;
    }
  };

  const runReclassify = async () => {
    const ids = props.paperIds;
    setReclass({ done: 0, total: ids.length });
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        await api(`/api/papers/${ids[i]}/classify`, { body: {} });
      } catch (e) {
        failed++;
        if (failed === 1) toast(errMsg(e));
        if (errMsg(e).includes("한도") || errMsg(e).includes("API 키")) break;
      }
      setReclass({ done: i + 1, total: ids.length });
    }
    toast(failed ? `다시 분류를 마쳤습니다 (실패 ${failed}편)` : "다시 분류를 마쳤습니다");
    setReclass(null);
    router.refresh();
  };
  const visible = props.fields;

  return (
    <div className="set">
      <div className="phead">
        <h1>설정</h1>
      </div>

      <section>
        <h2>계정</h2>
        <p className="sub">내 프로젝트와 서재는 나와 초대한 멤버만 볼 수 있습니다.</p>
        <div className="line">
          <span className="av">{(props.name || "나").slice(0, 1)}</span>
          <span style={{ flex: 1 }}>
            {props.name} <span className="meta">· {props.email}</span>
          </span>
          <button
            className="btn"
            onClick={async () => {
              await supabaseBrowser().auth.signOut();
              router.push("/login");
              router.refresh();
            }}
          >
            로그아웃
          </button>
        </div>
      </section>

      <PasswordSection />

      <section>
        <h2>이번 달 AI 사용량</h2>
        <div className="line" style={{ justifyContent: "space-between" }}>
          <span>
            <b style={{ fontFamily: "var(--f-mono)", fontSize: 22 }}>${props.usage.used.toFixed(2)}</b> <span className="meta">한국 시간 기준 이번 달 1일부터</span>
          </span>
          {editLimit ? (
            <form
              className="line"
              onSubmit={(e) => {
                e.preventDefault();
                call(() => api("/api/settings", { method: "PUT", body: { monthlyLimit: Number(limit) } }), "한도를 바꿨습니다").then((ok) => ok && setEditLimit(false));
              }}
            >
              <span className="meta">월 한도 $</span>
              <input className="field-in" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} style={{ width: 80 }} aria-label="월 한도 (달러)" />
              <button className="btn sm">저장</button>
            </form>
          ) : (
            <span className="meta">
              월 한도 ${props.usage.limit.toFixed(2)}{" "}
              <button className="linkbtn" onClick={() => setEditLimit(true)}>
                바꾸기
              </button>
            </span>
          )}
        </div>
      </section>

      <section>
        <h2>화면</h2>
        <p className="sub">고른 테마는 이 브라우저에 기억됩니다.</p>
        <span className="seg">
          {(
            [
              ["light", "주간"],
              ["dark", "야간"],
              ["system", "시스템 따라가기"],
            ] as [Theme, string][]
          ).map(([k, v]) => (
            <button
              key={k}
              type="button"
              aria-pressed={theme === k}
              onClick={() => {
                setTheme(k);
                applyTheme(k);
              }}
            >
              {v}
            </button>
          ))}
        </span>
      </section>

      <AiSection ai={props.ai} />

      <section>
        <h2>분야 관리</h2>
        <p className="sub">연구실 전체가 함께 쓰는 목록입니다. AI가 분류할 때 이 목록과 설명을 보니, 설명을 구체적으로 쓸수록 정확해집니다.</p>
        {visible.map((f, i) => (
          <FieldRow key={f.id} f={f} count={props.fieldCounts[f.id] ?? 0} first={i === 0} prev={visible[i - 1]} onChange={() => router.refresh()} />
        ))}
        <form
          className="frow"
          onSubmit={(e) => {
            e.preventDefault();
            call(() => api("/api/fields", { body: newField }), `‘${newField.name}’ 분야를 추가했습니다`).then((ok) => ok && setNewField({ name: "", description: "" }));
          }}
        >
          <input className="field-in" value={newField.name} onChange={(e) => setNewField({ ...newField, name: e.target.value })} placeholder="새 분야 이름" />
          <input className="field-in" value={newField.description} onChange={(e) => setNewField({ ...newField, description: e.target.value })} placeholder="설명 (분류 기준)" />
          <button className="btn" disabled={!newField.name.trim()}>
            + 분야 추가
          </button>
        </form>
        <div className="line" style={{ marginTop: 12 }}>
          <button className="btn" onClick={runReclassify} disabled={!!reclass || props.paperIds.length === 0}>
            {reclass ? `다시 분류하는 중… ${reclass.done}/${reclass.total}` : `기존 논문 다시 분류 (${props.paperIds.length}편)`}
          </button>
          <span className="hint" style={{ margin: 0 }}>
            자동으로 붙은 분야만 다시 판단합니다. 직접 지정한 분야는 그대로 둡니다.
          </span>
        </div>
      </section>

      <BackupSection />

      <ScholarSection />

      <KciSection />
    </div>
  );
}

/** 내가 볼 수 있는 모든 프로젝트를 JSON 파일 하나로 */
function BackupSection() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const data = await api<{ projects: { papers: unknown[] }[] }>("/api/backup");
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      downloadText(`strata-backup-${stamp}.json`, JSON.stringify(data, null, 2), "application/json");
      toast(`프로젝트 ${data.projects.length}개, 논문 ${data.projects.reduce((n, p) => n + p.papers.length, 0)}편을 백업했습니다`);
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h2>전체 백업</h2>
      <p className="sub">
        내가 볼 수 있는 모든 프로젝트를 파일 하나(JSON)로 내려받습니다. 논문 정보·초록·요약·분야·소주제·메모(공동 메모와 내 메모)·내 읽기 상태·저장한 검색어·공백 지도 저장본이 들어갑니다. 참고문헌 관리 프로그램용 파일은 비교표·서재의 <b>내보내기</b>를 쓰세요.
      </p>
      <button className="btn" onClick={run} disabled={busy}>
        {busy ? "모으는 중…" : "백업 파일 내려받기"}
      </button>
    </section>
  );
}

/** 구글 학술검색(SerpApi) 연결 상태와 이번 달 남은 횟수 */
function ScholarSection() {
  const [st, setSt] = useState<{ ready: boolean; ok?: boolean; left?: number | null; used?: number | null; limit?: number | null; error?: string } | null>(null);
  useEffect(() => {
    api<typeof st>("/api/scholar/status").then(setSt).catch(() => setSt(null));
  }, []);
  return (
    <section>
      <h2>구글 학술검색 연동</h2>
      <p className="sub">
        검색할 때 구글 학술검색 상위 20편을 함께 가져와 맨 위에 섞습니다 (SerpApi 경유). 검색 한 번에 1회를 쓰며, 같은 검색을 1시간 안에 다시 하면 세지 않습니다. 새 논문 알림에는 쓰지 않습니다.
      </p>
      {!st ? (
        <p className="meta">확인하는 중…</p>
      ) : !st.ready ? (
        <p className="warnbox">
          아직 연결되지 않았습니다. 관리자가 <a href="https://serpapi.com" target="_blank" rel="noreferrer">SerpApi</a>에 가입해 받은 키를 Vercel 환경 변수 <code>SERPAPI_KEY</code>에 넣고 Redeploy 하면 켜집니다.
        </p>
      ) : st.ok ? (
        <p>
          연결됨 · 이번 달 남은 횟수 <b>{st.left?.toLocaleString() ?? "?"}</b>
          {st.limit ? ` / ${st.limit.toLocaleString()}` : ""}
          {st.used != null ? <span className="meta"> (이번 달 {st.used.toLocaleString()}회 사용, 연구실 전체 합계)</span> : null}
        </p>
      ) : (
        <p className="warnbox">키는 있지만 확인하지 못했습니다: {st.error}. 키를 다시 복사해 넣어 주세요.</p>
      )}
    </section>
  );
}

/** 국내 논문 검색(KCI) 연결 확인: 연결 → 띄어쓰기 그대로 → 띄어쓰기 없이, 한 단계씩 확인하고 결과를 남겨 둔다 */
function KciSection() {
  const [q, setQ] = useState("디지털 읽기 평가");
  const [busy, setBusy] = useState<string | null>(null);
  const [ping, setPing] = useState<KciPingResult | null>(null);
  const [rows, setRows] = useState<KciTestRow[]>([]);
  const [fail, setFail] = useState<string | null>(null);
  const sec = (ms: number) => `${(ms / 1000).toFixed(1)}초`;

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setPing(null);
    setRows([]);
    setFail(null);
    try {
      setBusy("1/3 연결 확인 중…");
      const p = await api<KciPingResult>("/api/kci/test?step=ping");
      setPing(p);
      if (!p.ready) return;
      const queries = [...new Set([q.trim(), q.replace(/\s+/g, "")])];
      for (const [i, query] of queries.entries()) {
        setBusy(`${i + 2}/3 “${query}” 찾는 중…`);
        const r = await api<KciTestRow>(`/api/kci/test?q=${encodeURIComponent(query)}`);
        setRows((prev) => [...prev, r]);
      }
    } catch (err) {
      setFail(errMsg(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section>
      <h2>국내 논문 검색 (KCI)</h2>
      <p className="sub">
        공공데이터포털의 KCI 논문정보 서비스로 국내 학술지 논문을 제목으로 찾습니다. 관리자가 Vercel에 <code>KCI_SERVICE_KEY</code>를 넣으면 켜집니다.
      </p>
      <form className="line" onSubmit={run}>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} aria-label="KCI 확인용 검색어" />
        <button className="btn" disabled={!!busy || !q.trim()}>
          {busy ?? "연결 확인"}
        </button>
      </form>
      {fail && (
        <p className="warnbox" style={{ marginTop: 10 }}>
          확인 도중 멈췄습니다: {fail}
        </p>
      )}
      {ping && !ping.ready && (
        <p className="warnbox" style={{ marginTop: 10 }}>
          아직 KCI 인증키가 설정되지 않았습니다. Vercel → Settings → Environment Variables에 <code>KCI_SERVICE_KEY</code>를 넣고 Redeploy 해 주세요.
        </p>
      )}
      {ping?.ready && (
        <p className="meta" style={{ marginTop: 10 }}>
          서버 위치: <b>{ping.region ?? "알 수 없음"}</b> · Supabase 왕복 {ping.dbMs ?? "?"}ms · KCI 기본 연결:{" "}
          {ping.ok ? (
            <b>
              됨 ({sec(ping.ms)}, 전체 {ping.total?.toLocaleString() ?? "?"}편)
            </b>
          ) : (
            <b style={{ color: "var(--warn)" }}>
              안 됨 — {ping.error} ({sec(ping.ms)})
            </b>
          )}
        </p>
      )}
      {rows.map((r) => (
        <div key={r.query} style={{ marginTop: 12 }}>
          <b style={{ fontSize: 13 }}>“{r.query}”</b>{" "}
          {r.error ? (
            <span style={{ color: "var(--warn)", fontSize: 13 }}>
              — {r.error} ({sec(r.ms)})
            </span>
          ) : (
            <span className="meta">
              — 제목에 이 말이 들어간 논문 {r.total?.toLocaleString() ?? "?"}편 ({sec(r.ms)})
            </span>
          )}
          <ul className="mini-list" style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>
            {r.titles.map((t, i) => (
              <li key={i}>
                {t.title} {t.year ? `(${t.year})` : ""}
                <span className="meta">
                  {" "}
                  {t.abstract ? "· 초록 있음" : "· 초록 없음"}
                  {t.doi ? " · DOI 있음" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function FieldRow({ f, count, first, prev, onChange }: { f: Field; count: number; first: boolean; prev?: Field; onChange: () => void }) {
  const [name, setName] = useState(f.name);
  const [desc, setDesc] = useState(f.description);
  const [confirm, setConfirm] = useState(false);
  const patch = async (body: Partial<Field>) => {
    try {
      await api(`/api/fields/${f.id}`, { method: "PATCH", body });
      onChange();
    } catch (e) {
      toast(errMsg(e));
    }
  };
  return (
    <div className="frow" style={{ gridTemplateColumns: "150px minmax(0,1fr) auto", opacity: f.hidden ? 0.55 : 1 }}>
      <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <FieldTag field={{ name: f.name, color: f.color }} />
        <input className="field-in" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== f.name && patch({ name: name.trim() })} aria-label="분야 이름" style={{ padding: "4px 8px" }} />
      </span>
      <textarea className="field-in" style={{ minHeight: 44 }} value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== f.description && patch({ description: desc })} aria-label={`${f.name} 설명`} />
      <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
        <span className="c">{count}편</span>
        <span style={{ display: "flex", gap: 4 }}>
          <select className="cardsel" value={f.color % 12} onChange={(e) => patch({ color: Number(e.target.value) })} aria-label="색">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i}>
                색 {i + 1}
              </option>
            ))}
          </select>
          <button className="btn sm" disabled={first} onClick={() => prev && patch({ position: prev.position }).then(() => api(`/api/fields/${prev.id}`, { method: "PATCH", body: { position: f.position } }).then(onChange))} title="위로">
            ↑
          </button>
          <button className="btn sm" onClick={() => patch({ hidden: !f.hidden })}>
            {f.hidden ? "보이기" : "숨기기"}
          </button>
          {confirm ? (
            <button
              className="btn sm danger"
              onClick={async () => {
                try {
                  await api(`/api/fields/${f.id}`, { method: "DELETE" });
                  onChange();
                } catch (e) {
                  toast(errMsg(e));
                }
              }}
            >
              {count ? `${count}편에서 빼고 삭제` : "삭제"}
            </button>
          ) : (
            <button className="btn sm" onClick={() => setConfirm(true)}>
              삭제
            </button>
          )}
        </span>
      </span>
    </div>
  );
}

function PasswordSection() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast("비밀번호는 8자 이상으로 정해 주세요");
    if (pw !== pw2) return toast("두 비밀번호가 다릅니다");
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast(/different from the old/i.test(error.message) ? "지금 비밀번호와 다른 비밀번호를 정해 주세요" : "비밀번호를 바꾸지 못했습니다");
    setPw("");
    setPw2("");
    toast("비밀번호를 바꿨습니다");
  };
  return (
    <section>
      <h2>비밀번호 바꾸기</h2>
      <form className="line" onSubmit={save}>
        <input type="password" className="field-in" style={{ flex: 1 }} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="새 비밀번호 (8자 이상)" autoComplete="new-password" aria-label="새 비밀번호" />
        <input type="password" className="field-in" style={{ flex: 1 }} value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="한 번 더" autoComplete="new-password" aria-label="새 비밀번호 확인" />
        <button className="btn" disabled={busy || !pw}>
          바꾸기
        </button>
      </form>
    </section>
  );
}

function AiSection({ ai }: { ai: PublicAi }) {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>(ai.provider);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const meta = PROVIDERS[provider];
  const saved = ai.last4[provider];

  const choose = async (p: Provider) => {
    setProvider(p);
    setKey("");
    try {
      await api("/api/settings", { method: "PUT", body: { provider: p } });
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
  };
  const saveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("save");
    try {
      await api("/api/settings", { method: "PUT", body: { provider, key: { provider, value: key } } });
      setKey("");
      toast(`${meta.label} 키를 저장했습니다`);
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
    setBusy(null);
  };
  const removeKey = async () => {
    try {
      await api("/api/settings", { method: "PUT", body: { key: { provider, value: null } } });
      toast("키를 지웠습니다");
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
  };
  const test = async () => {
    setBusy("test");
    try {
      await api("/api/settings/test", { body: {} });
      toast(`연결됐습니다. ${meta.label}로 요약할 수 있습니다`);
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
    setBusy(null);
  };

  return (
    <section>
      <h2>요약에 쓸 AI</h2>
      <p className="sub">검색어 확장, 초록 요약, 분야 분류에 씁니다. 고른 AI의 API 키로 내 계정에 청구됩니다. 논문 검색 자체는 키가 없어도 됩니다.</p>
      {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
        <label className="radio" key={p}>
          <input type="radio" name="ai" checked={provider === p} onChange={() => choose(p)} />
          <div>
            <b>
              {PROVIDERS[p].label} {ai.last4[p] ? <span className="b">키 등록됨 …{ai.last4[p]}</span> : null}
            </b>
            <span>{PROVIDERS[p].note}</span>
          </div>
        </label>
      ))}
      <form className="line" onSubmit={saveKey} style={{ marginTop: 12 }}>
        <input
          type="password"
          className="field-in"
          style={{ flex: 1 }}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={saved ? `${meta.label} 키 …${saved} (바꾸려면 새 키 입력)` : `${meta.label} API 키 (${meta.keyHint})`}
          aria-label={`${meta.label} API 키`}
          autoComplete="off"
        />
        <button className="btn primary" disabled={!key.trim() || !!busy}>
          {busy === "save" ? "저장 중…" : "저장"}
        </button>
        {saved && (
          <button type="button" className="btn" onClick={test} disabled={!!busy}>
            {busy === "test" ? "확인 중…" : "연결 테스트"}
          </button>
        )}
      </form>
      <p className="hint">
        키 발급:{" "}
        <a href={meta.keyUrl} target="_blank" rel="noopener noreferrer">
          {meta.keyUrl.replace("https://", "")}
        </a>
        {" · "}키는 암호화해서 저장하고 끝 4자리만 보여줍니다. 다른 멤버는 볼 수 없습니다.
        {saved && (
          <>
            {" "}
            <button className="linkbtn" onClick={removeKey}>
              {meta.label} 키 지우기
            </button>
          </>
        )}
      </p>
    </section>
  );
}
