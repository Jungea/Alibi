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

R0 단계에서는 필요한 환경변수가 없습니다. 이후 릴리즈에서 필요해지면 `.env.example`과 이 문서에 추가합니다.

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
