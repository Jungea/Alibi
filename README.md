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
| `npm run test:e2e`     | Playwright E2E (아래 참고)    |

## 환경변수

`.env.example`을 복사해 `.env.local`을 만들고 값을 채웁니다. `.env.local`은 커밋하지 않습니다.

```bash
cp .env.example .env.local
```

| 변수                            | 설명                                                                  |
| ------------------------------- | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase 프로젝트 URL (R2~)                                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon(공개) 키 또는 publishable 키. 보안은 RLS가 담당합니다.           |
| `NEXT_PUBLIC_SENTRY_DSN`        | (선택) Sentry 오류 수집. 비우면 아무것도 보내지 않습니다.             |
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

## 게임방 (R3·R4·R5)

- **방 만들기:** `/builder`에서 발행된 시나리오의 "방 만들기"를 누르면 6자리 초대 코드가 발급되고, 만든 사람은 **GM 전용**으로 입장합니다(참가자로는 못 들어옵니다).
- **입장:** `/join` 또는 `/join/<코드>`에서 코드와 닉네임을 입력합니다. 로그인은 필요 없고 Supabase 익명 로그인으로 들어옵니다. 틀린 코드를 10분 안에 10번 입력하면 잠시 막힙니다. 새로고침·재접속해도 같은 방으로 돌아옵니다.
- **대기실:** 접속자 표시, 준비 완료, 최대 인원(시나리오 인물 수), GM의 랜덤 배정·직접 지정·내보내기.
- **진행:** 대기실 → 인물 확인 → 라운드(반복) → 투표 → 종료. GM 콘솔에서 라운드 시작/종료, 타이머 일시정지·±시간, 투표 시작, 게임 종료. 타이머는 서버에 저장된 종료 시각으로 계산합니다.
- **내 인물 카드:** 공개/비밀 정보, 개인 목표, 관계, 이미 시작한 라운드의 추가 정보. 서버가 본인 것만 돌려줍니다.
- **힌트 카드:** 허용된 라운드에서 "카드 뽑기"(한 라운드에 한 사람 최대 3장). 획득 라운드가 지정된 카드는 그 라운드에서만 나옵니다. 개인 카드는 뽑은 사람만, 전체 공개 카드는 모두 봅니다. 뽑지 않은 카드는 누구에게도 내려가지 않습니다.
- **채팅:** 전체 채팅(말한 사람은 인물 이름으로 표시, GM 화면에만 닉네임 병기), 시스템 메시지(라운드 시작·카드 획득 등), GM 공지. 최근 50개만 불러오고 위로 스크롤하면 이전 메시지를 더 불러옵니다. 5초에 5개까지(도배 방지), 라운드가 채팅을 허용할 때만 가능합니다.
- **귓속말·그룹 (R4):** 채팅 창에서 전체 / 귓속말 / 그룹을 고릅니다. 귓속말과 그룹 메시지는 받는 사람과 GM만 읽을 수 있고(DB 규칙으로 막혀 있어 실시간 알림에도 똑같이 적용), 보낸 사람의 계정은 저장하지 않습니다. 그룹은 2명 이상으로 만들고 비밀(초대만) 또는 공개(스스로 참여)를 고릅니다. 만든 사람이 멤버를 추가·내보내며, 한 사람당 3개까지입니다. 라운드의 허용 행동에 "귓속말·그룹 대화"가 있어야 보낼 수 있습니다.
- **GM 채팅 제어 (R4):** 대화 멈추기/다시 열기, 참가자별 발언 막기, "누군가 귓속말 중" 알림(켜면 20초에 한 번 전체에 알림, 내용은 새지 않음), 전체 대화 열람(GM 화면에 귓속말·그룹도 표시). 게임이 끝나고 결말을 끝까지 공개하면 참가자도 전체 대화 로그를 볼 수 있습니다.
- **미션 (R4):** 참가자는 "내 미션"(내 개인 미션 + 공통 미션, 숨김 미션 제외)을 보고, 자가 보고 미션은 "달성했어요"를 눌러 GM에게 알립니다. GM은 콘솔의 미션 현황에서 승인·반려하거나 직접 달성/실패를 정합니다(숨김·GM 판정 미션 포함). "자동 판정" 미션은 아직 자동 기준이 없어 GM이 확인합니다.
- **진행 방식 (R5):** GM이 채팅형/대면형을 고릅니다. 대면형은 채팅을 숨기고(서버에서도 참가자 채팅을 막음, GM 공지는 가능) 모여서 말로 진행합니다. GM이 외부 음성 링크(디스코드 등, http/https만)를 입력하면 참가자 화면에 표시됩니다.
- **테이블 화면 (R5):** GM 화면의 "테이블 화면 열기"(`/room/<방 id>/table`)를 TV·PC에 띄웁니다. 큰 타이머, 현재 라운드와 목표, 공개된 정보·공개 힌트, 투표 진행(몇 명 완료), 결말 연출(GM이 공개한 단계까지), 방 코드·QR이 나옵니다. **GM 계정으로 로그인한 브라우저에서만** 열리고, 서버가 공개 정보만 돌려줍니다. 인물 배정, 비밀 정보, 개인 힌트, 귓속말, 미션은 나오지 않습니다.
- **QR 입장 (R5):** 대기실(GM 콘솔)과 테이블 화면에 초대 링크 QR이 표시됩니다. 폰으로 스캔하면 닉네임 입력 화면으로 연결됩니다. QR은 브라우저에서 만들며 외부 서비스를 쓰지 않습니다.
- **투표:** 1인 1표(DB 제약), 자기 자신 제외. 누가 누구에게 투표했는지는 결말 공개 전에는 아무에게도 보이지 않습니다.
- **결말:** 게임 종료 시 **자동 판정**이 기본입니다(GM이 직접 고를 수도 있음). 결말 목록 순서대로 조건을 확인해 처음 맞는 결말을 고르고, 맞는 것이 없으면 "기본 결말", 그것도 없으면 첫 번째 결말입니다. 조건: 범인을 잡았을 때(가장 많은 표를 받은 사람이 혼자이고 범인), 놓쳤을 때(동점·투표 없음 포함), 미션 달성/실패 시. 투표 결과 → 진실 + 미션 달성표(숨김 미션 공개) → 인물별 후일담 순서로 GM이 단계마다 공개하며, 서버는 공개된 단계까지만 돌려줍니다. 판정 규칙은 `src/lib/game/ending.ts`(단위 테스트)와 DB 함수가 같고, DB 테스트가 두 결과를 전 조합으로 대조합니다.
- **GM 진행 자료:** 범인·타임라인·인물별 비밀·전체 힌트(참/거짓)를 GM만 볼 수 있습니다.

방 상태는 `rooms` / `room_players` / `room_assignments`에 있고, 모든 변경은 RPC로만 가능합니다. 누가 어떤 인물인지는 본인과 GM만 조회할 수 있고, 시나리오 원본(범인·진실)은 참가자에게 내려가지 않습니다. 권한 테스트는 `supabase/tests/rooms.test.ts`(방·입장·진행), `supabase/tests/play.test.ts`(카드·채팅·투표·결말), `supabase/tests/chat.test.ts`(귓속말·그룹·GM 제어·미션·결말 판정), `supabase/tests/table.test.ts`(진행 방식·테이블 화면)에 있습니다.

### 보안 구조

- 시나리오 원본(범인, 진실 등)은 제작자 본인만 읽고 쓸 수 있습니다. 모든 테이블에 RLS가 켜져 있습니다.
- 발행본은 수정·삭제할 수 없고, 공개 발행이어도 지금은 제작자만 직접 조회할 수 있습니다. (방 참가자 접근은 R3에서 RPC로 추가합니다.)
- 저장·발행·가져오기는 서버 액션을 거치며 Zod로 서버에서 다시 검증합니다. 발행은 화면의 값이 아니라 DB에 저장된 내용을 서버가 다시 검수한 뒤 만듭니다.
- 익명 로그인 사용자(R3 게임방 입장용)는 시나리오를 만들 수 없습니다.

### DB 마이그레이션과 권한 테스트

- 스키마는 `supabase/migrations/`의 SQL 파일로만 관리합니다. 대시보드에서 직접 수정하지 않습니다.
- `npm run test`는 Docker나 Supabase 없이 로컬 Postgres(PGlite)에 마이그레이션을 그대로 적용해 RLS 권한 테스트와 DB 계층 테스트를 실행합니다. (`supabase/tests/`)

### E2E 테스트 (Playwright)

`e2e/game.spec.ts`가 GM 1명 + 참가자 3명이 가입 → 시나리오 가져오기·발행 → 방 만들기 → 입장 → 배정 → 라운드 → 카드·채팅 → 투표 → 결말까지 진행하고, 참가자 브라우저가 받은 모든 응답(HTTP·웹소켓)에 타인의 비밀과 미공개 결말이 없는지 확인합니다.
실제 개발용 Supabase 프로젝트가 필요하며(이메일 확인 끔, Anonymous Sign-Ins 켬), 처음 한 번 브라우저를 설치합니다.

```bash
npx playwright install chromium
npm run test:e2e                         # 로컬 개발 서버를 띄워서 실행
E2E_BASE_URL=https://<미리보기 주소> npm run test:e2e   # 배포된 주소 대상
```

### Supabase 설정 (수동 설정을 마친 뒤)

개발용과 실사용 프로젝트에 같은 마이그레이션을 적용합니다.

```bash
npx supabase login                          # 브라우저에서 로그인
npx supabase link --project-ref <프로젝트 ref>  # DB 비밀번호 입력
npx supabase db push                        # supabase/migrations 적용
```

### R3 (게임방)

- [ ] `npx supabase db push`로 새 마이그레이션(게임방) 적용 — 개발용 `alibi-dev`, 이후 실사용 `alibi-prod`
- [ ] 대시보드 → Authentication → Sign In / Providers → **Anonymous Sign-Ins** 켜기 (참가자가 로그인 없이 입장하는 데 필요). 개발용·실사용 모두.
- [ ] (선택) 대시보드 → Database → Replication(또는 Publications)에서 `supabase_realtime`에 `rooms`, `room_players`가 들어 있는지 확인. 마이그레이션이 자동으로 추가하며, 빠져 있어도 8~15초마다 새로고침되어 동작은 합니다.
- [ ] (선택) 오류 수집: [sentry.io](https://sentry.io) 무료 플랜 가입 → 프로젝트(Next.js) 생성 → DSN 복사 → `.env.local`과 Vercel 환경변수에 `NEXT_PUBLIC_SENTRY_DSN` 입력. 비워 두면 꺼진 채로 동작합니다.
- [ ] `npx playwright install chromium` 후 `npm run test:e2e`로 E2E 첫 실행
- [ ] 두 기기(또는 시크릿 창)로 확인: 한쪽에서 방 만들기 → 다른 쪽에서 코드로 입장 → 준비/배정/시작

### R4 (귓속말·그룹·미션)

- [ ] `npx supabase db push`로 새 마이그레이션(귓속말·그룹·미션·결말 판정) 적용 — `alibi-dev`, 이후 `alibi-prod`. 새로 켤 설정은 없습니다.
- [ ] 세 기기(또는 시크릿 창)로 확인: 귓속말은 받는 사람에게만 보이는지, 비밀 그룹이 다른 사람에게 안 보이는지, 미션 보고→GM 승인, 자동 판정 결말이 투표·미션 결과대로 나오는지
- [ ] 시나리오에서 귓속말·그룹을 쓰려면 라운드의 허용 행동에 "귓속말·그룹 대화"를 체크해야 합니다(기존 시나리오는 이미 발행된 본은 바뀌지 않으니 새로 발행).

### R5 (대면 모드)

- [ ] `npx supabase db push`로 새 마이그레이션(진행 방식·테이블 화면) 적용 — `alibi-dev`, 이후 `alibi-prod`. 새로 켤 설정은 없습니다.
- [ ] TV(또는 큰 모니터)에서 GM 계정으로 로그인해 `/room/<방 id>/table`을 열고, 폰으로 QR을 스캔해 입장되는지 확인
- [ ] 대면형으로 바꾼 뒤 참가자 폰에 채팅이 사라지고, 테이블 화면에 비밀 정보가 나오지 않는지 확인

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
