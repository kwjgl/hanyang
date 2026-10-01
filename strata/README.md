# Strata

연구 주제(프로젝트)별로 국내외 논문을 넓게 찾고, 고른 논문의 초록을 Claude로 요약해 쌓아 두는 연구실 공유 도구입니다.

- 기획서: [`docs/PLAN.md`](docs/PLAN.md)
- 화면 시안: [`docs/ui-mockup.html`](docs/ui-mockup.html)

## 지금 되는 것 (1단계)

| 기능 | 내용 |
|---|---|
| 로그인 | Google 계정, 이메일 로그인 링크. `ALLOWED_EMAILS`로 연구실 사람만 가입 |
| 프로젝트 | 이름 · 연구 질문 · 분야 · 소주제. 편집 · 삭제 |
| 공유 | 이메일로 초대(편집 가능 / 보기만). 아직 가입하지 않은 사람은 가입하는 순간 자동으로 멤버가 됨 |
| 검색 | OpenAlex · Semantic Scholar · ERIC · Crossref(국내 학술지). Claude가 한국어·영어 검색어로 넓힘. 범위(전체/국내/해외), 정렬(관련도·영향력·피인용·최신), 상위 10%·리뷰만 |
| 국내 논문 | Crossref·OpenAlex로 자동 검색 + KCI · RISS · DBpia · Google 학술검색으로 바로 가는 링크 + DOI·주소 붙여넣기 / 직접 입력 |
| 인용 추적 | 이 논문을 인용한 논문 · 참고문헌 · 비슷한 논문 |
| 검색 기록 | 30일 보관, 다시 검색하지 않고 열기. “이 검색 저장”하면 계속 보관 |
| 요약 | 고른 논문만 요약 (Claude Sonnet 5.5). 같은 논문은 누가 만든 요약이든 재사용. 분야·연구 유형·대상 학교급을 같은 호출에서 분류 |
| 영향력 지표 | 분야·연도 보정 피인용 백분위(상위 1%·10%), 핵심 인용, 최근 논문 · 비학술지 표시 |
| 비교표 | 소주제·분야·연도로 묶기, 행 펼쳐 요약 전문·원문 초록·메모(공동/나만)·읽기 상태·별표, 표 복사, APA 복사 |
| 서재 | 전체 · 읽을 것 · 최근 2주 · 별표 · 분야별 |
| 설정 | API 키(암호화 저장) · 이번 달 사용량과 월 한도 · 화면 테마 · 분야 관리와 다시 분류 |

2단계(대시보드 · 관계도 · 연구 동향 · 핵심 문헌 후보 · 주간 알림)와 3단계(연구 공백 지도 · 학위논문 · 내보내기)는 기획서를 참고하세요.

## 설치와 배포

처음 한 번, 앱을 운영할 사람(관리자)이 아래를 진행합니다. 30분 정도 걸립니다.

### 1. Supabase 프로젝트 만들기

1. <https://supabase.com>에서 무료 계정을 만들고 **New project**를 누릅니다. 지역은 Seoul(Northeast Asia)을 고릅니다.
2. 왼쪽 **SQL Editor**에서 [`supabase/migrations/20261001000000_init.sql`](supabase/migrations/20261001000000_init.sql) 내용을 통째로 붙여넣고 **Run**을 누릅니다.
3. **Project Settings → API**에서 `Project URL`과 `anon public` 키를 복사해 둡니다.

### 2. 로그인 설정

1. **Authentication → URL Configuration**
   - Site URL: 배포 주소 (예: `https://strata-lab.vercel.app`). 처음엔 `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/callback`, `https://배포주소/auth/callback`
2. **이메일 링크 로그인**은 기본으로 켜져 있습니다. 무료 요금제의 기본 메일 발송은 시간당 몇 통으로 제한되니, 사람이 많아지면 **Authentication → SMTP**에 학교·Gmail SMTP를 연결하세요.
3. **Google 로그인** (선택)
   - Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → **OAuth 클라이언트 ID**(웹 애플리케이션)를 만듭니다.
   - 승인된 리디렉션 URI에 Supabase의 **Authentication → Providers → Google** 화면에 나오는 Callback URL을 넣습니다.
   - 받은 클라이언트 ID와 보안 비밀을 Supabase의 Google 설정에 넣고 켭니다.

### 3. 내 컴퓨터에서 실행해 보기

```bash
cd strata
npm install
cp .env.example .env.local   # 값 채우기 (아래 설명)
npm run dev                  # http://localhost:3000
```

`.env.local`에 최소한 이 세 가지를 채웁니다.

| 이름 | 값 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 1-3에서 복사한 Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 1-3에서 복사한 anon public 키 |
| `API_KEY_ENCRYPTION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` 결과. **한 번 정하면 바꾸지 마세요** |

연구실 사람만 쓰게 하려면 `ALLOWED_EMAILS=@hanyang.ac.kr,동료@gmail.com`처럼 적습니다.

### 4. Vercel에 올리기

1. 이 저장소를 GitHub에 올린 상태에서 <https://vercel.com>에 GitHub 계정으로 로그인합니다.
2. **Add New → Project**에서 저장소를 고르고 **Root Directory**를 `strata`로 정합니다.
3. **Environment Variables**에 `.env.local`과 같은 값을 넣고 **Deploy**를 누릅니다.
4. 배포 주소를 2-1의 Site URL·Redirect URLs에 추가합니다.

### 5. 쓰기 시작

1. 로그인 → **설정**에서 각자 [Anthropic API 키](https://console.anthropic.com)를 등록하고 **연결 테스트**를 누릅니다.
2. 새 프로젝트를 만들고, **공유**에서 동료 이메일을 초대합니다.

## 비용

- Supabase · Vercel: 연구실 규모는 무료 요금제로 충분합니다.
- Claude: 각자 자기 API 키로 청구됩니다. 요약 1편 약 $0.01, 검색어 확장 1회 약 $0.004. 설정의 월 한도(기본 $5)에 닿으면 멈춥니다.
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
