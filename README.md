# 알리바이 (Alibi)

머더미스터리를 제작하고, 진행 도구로 쓰고, 온라인에서 플레이하는 웹서비스입니다.
개발 계획과 릴리즈 단위는 [`PLAN.md`](./PLAN.md)를 참고하세요.

## 기술 스택

Next.js (App Router) · TypeScript(strict) · Tailwind CSS · shadcn/ui · Vitest

## 실행 방법

필요 환경: Node.js 20 이상 (개발 환경은 22), npm

```bash
npm install        # 의존성 설치
npm run dev        # 개발 서버 (http://localhost:3000)
```

| 명령                   | 설명                          |
| ---------------------- | ----------------------------- |
| `npm run dev`          | 개발 서버 실행                |
| `npm run build`        | 프로덕션 빌드                 |
| `npm run start`        | 빌드 결과 실행                |
| `npm run lint`         | ESLint 검사                   |
| `npm run typecheck`    | TypeScript 타입 검사          |
| `npm run test`         | 단위 테스트 1회 실행 (Vitest) |
| `npm run test:watch`   | 단위 테스트 감시 모드         |
| `npm run format`       | Prettier로 코드 정리          |
| `npm run format:check` | Prettier 검사만               |

## 환경변수

`.env.example`을 복사해 `.env.local`을 만들고 값을 채웁니다. `.env.local`은 커밋하지 않습니다.

```bash
cp .env.example .env.local
```

| 변수                            | 설명                                                                  |
| ------------------------------- | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase 프로젝트 URL (R2~)                                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon(공개) 키 또는 publishable 키. 보안은 RLS가 담당합니다.           |
| `NEXT_PUBLIC_SITE_URL`          | (선택) 이메일 확인 링크가 돌아올 주소. 비우면 요청 주소를 사용합니다. |

`service_role` 키는 이 앱 코드에서 사용하지 않습니다. 환경변수가 없어도 홈과 도움도구(`/tools`)는 정상 동작하고, 시나리오 제작 화면에는 설정 안내가 표시됩니다.

## 도움도구 (R1)

로그인과 DB 없이 `/tools`에서 바로 쓸 수 있습니다. 데이터는 브라우저의 `localStorage`에만 저장됩니다.

| 경로            | 기능                                                                           |
| --------------- | ------------------------------------------------------------------------------ |
| `/tools/timer`  | 다중 타이머, 프리셋, 1분 전·30초 전·종료 알림(소리·진동·화면 깜빡임), 전체화면 |
| `/tools/random` | 인물 배정, 카드 뽑기(뽑은 카드 제외 옵션), 발언 순서                           |
| `/tools/vote`   | 한 기기를 돌려가며 익명 투표, 결과 집계와 동점 표시                            |

- 타이머는 종료 시각을 저장하고 매번 현재 시각과의 차이로 계산하므로 다른 탭에 있다 와도, 새로고침해도 시간이 맞습니다.
- 소리는 브라우저 정책상 시작·추가 버튼을 한 번 누른 뒤부터 납니다. 진동은 iOS에서 지원되지 않습니다.
- 랜덤은 `crypto.getRandomValues` 기반 Fisher–Yates 셔플을 사용합니다.

## 시나리오 제작 (R2)

로그인한 사용자가 `/builder`에서 머더미스터리를 만들고 발행합니다. (Supabase 설정 필요, 아래 "수동 설정" 참고)

- **로그인:** 이메일/비밀번호 (`/login`). 구글 로그인은 이후에 추가합니다.
- **제작 마법사 (8단계):** 기본 정보 → 세계관·사건 → 인물 → 진실 타임라인 → 라운드 → 힌트카드 → 미션 → 결말. 입력하면 변경된 단계만 자동 임시저장되고, 저장되지 않은 변경이 있으면 이탈 경고가 뜹니다.
- **검수·발행:** 범인 미지정, 인원수 대비 인물 부족, 자동 모드와 호환되지 않는 자가 보고 미션, 타임라인상 같은 시각 두 장소 등을 검사합니다. 오류가 없어야 발행할 수 있고, 발행하면 그 시점의 스냅샷(버전)이 저장됩니다.
- **테스트 플레이:** 인물을 바꿔가며 그 플레이어에게 무엇이 보이는지 미리 확인합니다.
- **내 시나리오:** 복제, 삭제, JSON 내보내기/가져오기(백업). 사용자당 시나리오는 최대 50개입니다.
- **일러스트:** JPG·PNG·WebP만 허용하며 업로드 전에 브라우저에서 줄이고, 본인 폴더에만 저장됩니다. 복제·가져오기 시 본인 폴더의 이미지만 유지됩니다.

## 게임방 (R3 진행 중: 방·입장·진행 로직)

- **방 만들기:** `/builder`에서 발행된 시나리오의 "방 만들기"를 누르면 6자리 초대 코드가 발급되고, 만든 사람은 **GM 전용**으로 입장합니다(참가자로는 못 들어옵니다).
- **입장:** `/join` 또는 `/join/<코드>`에서 코드와 닉네임을 입력합니다. 로그인은 필요 없고 Supabase 익명 로그인으로 들어옵니다. 틀린 코드를 10분 안에 10번 입력하면 잠시 막힙니다. 새로고침·재접속해도 같은 방으로 돌아옵니다.
- **대기실:** 접속자 표시, 준비 완료, 최대 인원(시나리오 인물 수), GM의 랜덤 배정·직접 지정·내보내기.
- **진행:** 대기실 → 인물 확인 → 라운드(반복) → 투표 → 종료. GM 콘솔에서 라운드 시작/종료, 타이머 일시정지·±시간, 투표 시작, 게임 종료. 타이머는 서버에 저장된 종료 시각으로 계산합니다.
- **아직 없음 (R3-C·D):** 인물 상세 카드, 힌트 카드, 채팅, 투표 집계, 결말 공개.

방 상태는 `rooms` / `room_players` / `room_assignments`에 있고, 모든 변경은 RPC로만 가능합니다. 누가 어떤 인물인지는 본인과 GM만 조회할 수 있고, 시나리오 원본(범인·진실)은 참가자에게 내려가지 않습니다. 권한 테스트는 `supabase/tests/rooms.test.ts`에 있습니다.

### 보안 구조

- 시나리오 원본(범인, 진실 등)은 제작자 본인만 읽고 쓸 수 있습니다. 모든 테이블에 RLS가 켜져 있습니다.
- 발행본은 수정·삭제할 수 없고, 공개 발행이어도 지금은 제작자만 직접 조회할 수 있습니다. (방 참가자 접근은 R3에서 RPC로 추가합니다.)
- 저장·발행·가져오기는 서버 액션을 거치며 Zod로 서버에서 다시 검증합니다. 발행은 화면의 값이 아니라 DB에 저장된 내용을 서버가 다시 검수한 뒤 만듭니다.
- 익명 로그인 사용자(R3 게임방 입장용)는 시나리오를 만들 수 없습니다.

### DB 마이그레이션과 권한 테스트

- 스키마는 `supabase/migrations/`의 SQL 파일로만 관리합니다. 대시보드에서 직접 수정하지 않습니다.
- `npm run test`는 Docker나 Supabase 없이 로컬 Postgres(PGlite)에 마이그레이션을 그대로 적용해 RLS 권한 테스트와 DB 계층 테스트를 실행합니다. (`supabase/tests/`)

### Supabase 설정 (수동 설정을 마친 뒤)

개발용과 실사용 프로젝트에 같은 마이그레이션을 적용합니다.

```bash
npx supabase login                          # 브라우저에서 로그인
npx supabase link --project-ref <프로젝트 ref>  # DB 비밀번호 입력
npx supabase db push                        # supabase/migrations 적용
```

### R3 (방 입장·진행 단계)

- [ ] `npx supabase db push`로 새 마이그레이션(게임방) 적용 — 개발용 `alibi-dev`, 이후 실사용 `alibi-prod`
- [ ] 대시보드 → Authentication → Sign In / Providers → **Anonymous Sign-Ins** 켜기 (참가자가 로그인 없이 입장하는 데 필요). 개발용·실사용 모두.
- [ ] (선택) 대시보드 → Database → Replication(또는 Publications)에서 `supabase_realtime`에 `rooms`, `room_players`가 들어 있는지 확인. 마이그레이션이 자동으로 추가하며, 빠져 있어도 8~15초마다 새로고침되어 동작은 합니다.
- [ ] 두 기기(또는 시크릿 창)로 확인: 한쪽에서 방 만들기 → 다른 쪽에서 코드로 입장 → 준비/배정/시작

## 폴더 구조

```
src/
  app/                 라우트
  components/ui/       shadcn/ui 컴포넌트
  features/            tools / builder / room / table
  lib/                 game(게임 로직) / supabase / schemas(Zod)
supabase/
  migrations/          SQL 마이그레이션
  tests/               권한(RLS) 테스트
e2e/                   Playwright
```

## 배포 (Vercel)

`main` 브랜치에 푸시하면 Vercel이 자동으로 빌드·배포합니다. 다른 브랜치는 미리보기 배포가 만들어집니다.
빌드 설정은 기본값(Next.js 자동 감지)을 그대로 사용합니다.

## 수동 설정

사람이 직접 해야 하는 작업입니다. 해당 작업이 끝나면 체크합니다.

### R0

- [ ] GitHub 저장소(`Jungea/Alibi`)에 푸시: `git push -u origin main`
- [ ] Vercel 대시보드 → Add New → Project → GitHub 저장소 `Alibi` 선택 → Deploy (설정은 기본값 그대로)
- [ ] 발급된 Vercel 주소에서 홈 화면("알리바이")이 열리는지 확인

### R1

없음 (외부 서비스를 사용하지 않습니다).

### R2

모두 무료 플랜으로 가능합니다. 시나리오 제작 화면을 쓰려면 아래를 해야 합니다. (하기 전에도 앱은 동작하지만 제작 화면에는 설정 안내만 보입니다.)

**1. Supabase 프로젝트 만들기**

- [ ] [supabase.com](https://supabase.com)에 가입하고 프로젝트 2개 생성: 개발용 `alibi-dev`, 실사용 `alibi-prod` (무료 플랜은 활성 프로젝트 2개까지)
- [ ] 각 프로젝트의 DB 비밀번호를 안전한 곳에 보관

**2. 개발 환경 연결**

- [ ] `alibi-dev` 대시보드 → Project Settings → API 에서 Project URL과 anon(또는 publishable) 키 확인
- [ ] 프로젝트 루트에 `.env.local` 파일을 만들고 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 입력 (커밋하지 않습니다)
- [ ] 터미널에서 `npx supabase login` → `npx supabase link --project-ref <alibi-dev ref>` → `npx supabase db push`
- [ ] 대시보드 → Authentication → Sign In / Providers → Email: 개발용 프로젝트에서는 "Confirm email"을 꺼서 가입 즉시 로그인되게 합니다. (실사용 프로젝트는 켜 둡니다.)
- [ ] 대시보드 → Authentication → URL Configuration: Site URL에 `http://localhost:3000`, Redirect URLs에 `http://localhost:3000/**` 추가
- [ ] 대시보드 → Storage 에서 `scenario-images` 버킷이 비공개(Private)로 생성되었는지 확인
- [ ] `npm run dev` 후 `/login`에서 가입하고 `/builder`에서 시나리오 생성 확인

**3. 배포 환경 연결**

- [ ] `alibi-prod`에도 `npx supabase link`(prod ref) → `npx supabase db push` 실행
- [ ] Vercel 프로젝트 → Settings → Environment Variables 에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 `alibi-prod` 값으로 등록 (Production), 미리보기 배포에는 `alibi-dev` 값 (Preview)
- [ ] `alibi-prod` → Authentication → URL Configuration: Site URL에 Vercel 주소, Redirect URLs에 `https://<Vercel 주소>/**` 추가
- [ ] 재배포 후 배포 주소에서 가입·시나리오 생성 확인

**4. (나중에) 구글 로그인**

- [ ] Google Cloud Console에서 OAuth 클라이언트 생성 후 Supabase → Authentication → Providers → Google에 클라이언트 ID/시크릿 입력. 앱의 구글 로그인 버튼은 이후 릴리즈에서 추가합니다.

Supabase 무료 플랜은 1주일 동안 사용하지 않으면 프로젝트가 일시정지됩니다. 모임 전날 접속해 확인하세요.
