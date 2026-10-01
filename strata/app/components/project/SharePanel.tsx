"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errMsg, toast } from "@/lib/client";
import type { ProjectData } from "@/lib/server/load";
import { Avatar } from "../bits";

const ROLE = { owner: "소유자", editor: "편집 가능", viewer: "보기만" } as const;

export function SharePanel({ data }: { data: ProjectData }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const isOwner = data.role === "owner";
  const pid = data.project.id;

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ status: "added" | "invited" }>(`/api/projects/${pid}/members`, { body: { email, role } });
      toast(r.status === "added" ? `${email} 님을 멤버로 추가했습니다` : `${email} 님이 이 이메일로 가입하면 자동으로 멤버가 됩니다`);
      setEmail("");
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
  };
  const change = async (userId: string, r: string) => {
    try {
      await api(`/api/projects/${pid}/members`, { method: "PATCH", body: { userId, role: r } });
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
  };
  const remove = async (q: string, self = false) => {
    try {
      await api(`/api/projects/${pid}/members?${q}`, { method: "DELETE" });
      if (self) {
        toast("프로젝트에서 나왔습니다");
        router.push("/");
      }
      router.refresh();
    } catch (e) {
      toast(errMsg(e));
    }
  };

  return (
    <section className="share">
      <h3>프로젝트 공유</h3>
      {isOwner ? (
        <form className="line" onSubmit={invite}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="동료 이메일" aria-label="초대할 이메일" />
          <select className="cardsel" value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")} aria-label="권한">
            <option value="editor">편집 가능</option>
            <option value="viewer">보기만</option>
          </select>
          <button className="btn primary" type="submit" disabled={!email.includes("@")}>
            초대
          </button>
        </form>
      ) : (
        <p className="hint" style={{ margin: 0 }}>
          초대와 권한 변경은 소유자만 할 수 있습니다.
        </p>
      )}
      <div style={{ marginTop: 10 }}>
        {data.members.map((m, i) => (
          <div className="mrow" key={m.user_id}>
            <Avatar name={m.name} i={i} />
            <span>
              {m.name}
              {m.user_id === data.meId ? " (나)" : ""} <span className="meta">{m.email}</span>
            </span>
            {isOwner && m.role !== "owner" ? (
              <span style={{ display: "inline-flex", gap: 6 }}>
                <select className="cardsel" value={m.role} onChange={(e) => change(m.user_id, e.target.value)} aria-label={`${m.name} 권한`}>
                  <option value="editor">편집 가능</option>
                  <option value="viewer">보기만</option>
                </select>
                <button className="btn sm" onClick={() => remove(`userId=${m.user_id}`)}>
                  내보내기
                </button>
              </span>
            ) : m.user_id === data.meId && m.role !== "owner" ? (
              <button className="btn sm" onClick={() => remove(`userId=${m.user_id}`, true)}>
                나가기
              </button>
            ) : (
              <span className="meta">{ROLE[m.role]}</span>
            )}
          </div>
        ))}
        {data.invites.map((v) => (
          <div className="mrow" key={v.email}>
            <span className="av c3">?</span>
            <span>
              {v.email} <span className="meta">· 가입 대기 중</span>
            </span>
            {isOwner ? (
              <button className="btn sm" onClick={() => remove(`email=${encodeURIComponent(v.email)}`)}>
                초대 취소
              </button>
            ) : (
              <span className="meta">{ROLE[v.role]}</span>
            )}
          </div>
        ))}
      </div>
      <p className="hint">
        편집 가능: 검색·요약·보관·소주제 정리 · 보기만: 비교표 열람과 메모.
        <br />
        요약은 실행한 사람의 API 키로 한 번만 만들어지고 멤버 모두가 함께 봅니다. 메모는 “공동 메모”와 “나만 보기” 중에서 고릅니다.
      </p>
    </section>
  );
}
