# Strata

연구 주제(프로젝트)별로 국내외 논문을 넓게 찾고, 고른 논문의 초록을 Claude로 요약해 쌓아 두는 연구실 공유 도구입니다.

- 기획서: [`docs/PLAN.md`](docs/PLAN.md)
- 화면 시안: [`docs/ui-mockup.html`](docs/ui-mockup.html)

## 지금 되는 것 (1단계)

| 기능 | 내용 |
|---|---|
| 로그인 | 이메일 + 비밀번호. 계정은 관리자가 Supabase에서 만들어 줌. 설정에서 비밀번호 변경 |
| 프로젝트 | 이름 · 연구 질문 · 분야 · 소주제. 편집 · 삭제 |
| 공유 | 이메일로 초대(편집 가능 / 보기만). 아직 가입하지 않은 사람은 가입하는 순간 자동으로 멤버가 됨 |
| 검색 | OpenAlex · Semantic Scholar · ERIC · Crossref(국내 학술지). Claude가 한국어·영어 검색어로 넓힘. 범위(전체/국내/해외), 정렬(관련도·영향력·피인용·최신), 상위 10%·리뷰만 |
| 국내 논문 | Crossref·OpenAlex로 자동 검색 + KCI · RISS · DBpia · Google 학술검색으로 바로 가는 링크 + DOI·주소 붙여넣기 / 직접 입력 |
| 인용 추적 | 이 논문을 인용한 논문 · 참고문헌 · 비슷한 논문 |
| 검색 기록 | 30일 보관, 다시 검색하지 않고 열기. “이 검색 저장”하면 계속 보관 |
| 요약 | 고른 논문만 요약 (Claude · Gemini · ChatGPT 중 각자 선택). 같은 논문은 누가 만든 요약이든 재사용. 분야·연구 유형·대상 학교급을 같은 호출에서 분류 |
| 영향력 지표 | 분야·연도 보정 피인용 백분위(상위 1%·10%), 핵심 인용, 최근 논문 · 비학술지 표시 |
| 비교표 | 소주제·분야·연도로 묶기, 행 펼쳐 요약 전문·원문 초록·메모(공동/나만)·읽기 상태·별표, 표 복사, APA 복사 |
| 대시보드 | 소주제별 편수(보강 필요 표시) · 출판 연도 · 연구 유형 · 영향력 · 분야 · 대상 학교급 · 읽기 상태 · 주별 보관 · 공유 멤버 활동 |
| 핵심 문헌 후보 | 보관한 논문 여러 편이 함께 인용하는데 아직 보관하지 않은 논문 (OpenAlex 참고문헌 목록). 비교표 아래와 대시보드에서 확인, 검색 결과로 열어 요약·보관. 이때 빠진 피인용 수·영향력 지표도 채움 |
| 관계도 | 관계망(서로 인용하는 논문끼리 모임, 끌어서 옮기기·확대·축소, 점을 누르면 연결된 논문 강조) · 연도 계보(가로 연도 × 세로 소주제). 핵심 후보도 점선으로 함께 표시 |
| 서재 | 전체 · 읽을 것 · 최근 2주 · 별표 · 분야별 |
| 설정 | API 키(암호화 저장) · 이번 달 사용량과 월 한도 · 화면 테마 · 분야 관리와 다시 분류 |

2단계 남은 것(연구 동향 · 주간 알림)과 3단계(연구 공백 지도 · 학위논문 · 내보내기)는 기획서를 참고하세요.

## 다른 컴퓨터·휴대폰에서 쓰기

Strata는 인터넷 주소로 여는 웹 앱이라 설치할 것이 없습니다. 어느 컴퓨터든 브라우저로 앱 주소에 들어가 로그인하면 같은 프로젝트와 서재가 그대로 보입니다.

- 앱 주소: Vercel → strata 프로젝트 → 위쪽 **Domains**에 나온 주소 (예: `https://strata-xxxx.vercel.app`). 즐겨찾기해 두세요.
- 주소를 짧게 바꾸려면 Vercel → **Settings → Domains**에서 `원하는이름.vercel.app`으로 고칠 수 있습니다. 바꾸면 Supabase **Authentication → URL Configuration**의 Site URL도 새 주소로 바꿔 주세요.

## 계정 만들기 (관리자)

1. Supabase → **Authentication → Users → Add user → Create new user**
2. 이메일과 처음 비밀번호를 넣고 **Auto Confirm User**를 체크한 뒤 만듭니다.
3. 그 사람에게 앱 주소·이메일·처음 비밀번호를 알려 줍니다. 처음 로그인한 뒤 **설정 → 비밀번호 바꾸기**에서 바꾸면 됩니다.
4. 프로젝트 공유는 앱의 **공유** 버튼에서 같은 이메일로 초대합니다. 계정을 나중에 만들어도 초대가 자동으로 연결됩니다.

외부인이 가입하지 못하게 Supabase → **Authentication → Sign In / Providers**에서 **Allow new users to sign up**을 꺼 두세요.

## 처음 설치 (이미 끝남 · 기록용)

1. Supabase 프로젝트를 만들고 SQL Editor에서 [`supabase/migrations/20261001000000_init.sql`](supabase/migrations/20261001000000_init.sql)을 실행합니다.
2. Vercel에 배포하고 환경 변수 3개를 넣습니다.

| 이름 | 값 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL (`https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Publishable key (`sb_publishable_…`) 또는 anon public 키 |
| `API_KEY_ENCRYPTION_SECRET` | 32자 이상 무작위 문자열. **한 번 정하면 바꾸지 않습니다** |

3. Supabase **Authentication → URL Configuration**의 Site URL에 앱 주소를 넣습니다.
4. 설정이 잘못되면 앱이 오류 대신 **설정 점검** 화면(`/setup`)을 띄워 어떤 값이 틀렸는지 알려 줍니다. 값을 고친 뒤에는 Vercel **Deployments → ⋯ → Redeploy**를 눌러야 반영됩니다.

배포는 `kwjgl/strata` 저장소의 main에 올라간 코드로 자동으로 됩니다. Vercel 무료 요금제는 비공개 저장소에서 저장소 주인이 아닌 사람이 올린 커밋을 배포하지 않으므로, 커밋 작성자를 저장소 주인(kwjgl)으로 해야 합니다.

### 요약에 쓸 AI (각자)

Strata **설정 → 요약에 쓸 AI**에서 Claude · Gemini · ChatGPT 중 하나를 고르고 그 회사의 API 키를 넣은 뒤 **연결 테스트**를 누릅니다. 사람마다 다른 AI를 써도 됩니다.

| AI | 키 발급 | 요금 |
|---|---|---|
| Claude | [console.anthropic.com](https://console.anthropic.com/settings/keys) | 충전 필요(최소 $5). 요약 100편 약 $1 |
| Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | 무료 사용량 있음(하루 요청 수 제한). 무료분은 Google이 서비스 개선에 쓸 수 있음 |
| ChatGPT | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | 충전 필요(최소 $5) |

Claude·ChatGPT 구독(Pro·Plus 등)과 API 요금은 따로입니다. 키가 없어도 검색·보관은 되지만 검색어 확장과 요약은 꺼집니다.

## 비용

- Supabase · Vercel: 연구실 규모는 무료 요금제로 충분합니다.
- AI: 각자 고른 AI의 자기 API 키로 청구됩니다. Claude 기준 요약 1편 약 $0.01, Gemini는 무료 사용량 안에서 0원. 설정의 월 한도(기본 $5)에 닿으면 멈춥니다.
- 이미 누가 요약한 논문은 다시 요약하지 않고 재사용하므로 비용이 들지 않습니다.

## 개발

```bash
npm test            # 단위 테스트 + 데이터베이스 권한(RLS) 테스트 (PGlite)
npm run typecheck
npm run build
STRATA_PREVIEW=1 NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run dev
# → http://localhost:3000/preview 에서 예시 데이터로 화면 확인 (저장되지 않음)
```

| 경로 | 내용 |
|---|---|
| `supabase/migrations/` | 테이블 · 행 단위 보안(RLS) · 초대 자동 수락 · 이번 달 사용량 함수 |
| `lib/sources/` | OpenAlex · Semantic Scholar · ERIC · Crossref 응답 파서 |
| `lib/search/` | 검색 계획(검색어 × 출처), 중복 합치기, 순위 결합 |
| `lib/claude/` | 프롬프트 · 출력 스키마 · 요금 계산 · API 호출 |
| `lib/server/` | API 공통 처리, 요약·재사용·분류, 화면 데이터 불러오기 |
| `app/api/` | API 경로 |
| `app/components/` | 화면 (사이드바 · 프로젝트 · 비교표 · 서재 · 설정) |

## 알려진 한계

- 이 저장소를 만든 작업 환경에서는 외부 학술 API 접속이 막혀 있어, 각 출처의 응답 형식은 공식 문서 기준 예시로만 검증했습니다. 처음 배포한 뒤 실제 검색이 잘 되는지 확인해 주세요.
- KCI Open API는 승인과 고정 서버 IP가 필요해 1단계에서는 쓰지 않습니다. 국내 학술지는 Crossref·OpenAlex에 DOI가 등록된 논문만 자동으로 찾고, 나머지는 링크와 DOI 붙여넣기로 추가합니다.
- 국내 사이트 검색 링크의 주소 형식은 각 사이트 사정에 따라 바뀔 수 있습니다.
