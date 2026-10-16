import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { buildE2eScenario } from "./fixtures/scenario";

/**
 * 한 판 완주: GM 1명 + 참가자 3명이 입장 → 배정 → 라운드 → 카드 → 채팅 → 투표 → 결말까지 진행하고,
 * 그동안 참가자 브라우저가 받은 모든 응답(HTTP, 웹소켓)에 타인의 비밀과 미공개 결말이 없는지 확인한다.
 */

const SECRETS = ["E2E-SECRET-집사", "E2E-SECRET-정원사", "E2E-SECRET-하녀"];
const PASSWORD = "e2e-password-1234";

interface Player {
  page: Page;
  context: BrowserContext;
  nickname: string;
  /** 이 브라우저가 서버에서 받은 모든 내용 */
  received: string[];
}

function recordTraffic(page: Page, sink: string[]) {
  page.on("response", async (res) => {
    if (!/supabase\.co|\/rest\/v1\/|\/auth\/v1\//.test(res.url())) return;
    try {
      sink.push(await res.text());
    } catch {
      // 본문이 없는 응답(리다이렉트 등)은 건너뛴다.
    }
  });
  page.on("websocket", (ws) => {
    ws.on("framereceived", (f) => sink.push(String(f.payload)));
  });
}

async function startRoundNamed(gm: Page, name: string) {
  await gm
    .getByRole("button", { name: new RegExp(`다음 라운드 시작: ${name}`) })
    .click();
  await expect(
    gm.getByRole("heading", { name: new RegExp(`\\d\\. ${name}`) }),
  ).toBeVisible();
}

test("GM 1명과 참가자 3명이 한 판을 끝까지 진행한다", async ({ browser }) => {
  // ---------------- GM: 가입 → 시나리오 가져오기 → 발행 → 방 만들기 ----------------
  const gmContext = await browser.newContext();
  const gm = await gmContext.newPage();
  gm.on("dialog", (d) => void d.accept());

  await gm.goto("/login");
  await gm.getByLabel("이메일").fill(`e2e+${Date.now()}@example.com`);
  await gm.getByLabel("비밀번호").fill(PASSWORD);
  await gm.getByRole("button", { name: "회원가입" }).click();
  await expect(gm).toHaveURL(/\/builder/);

  await gm.getByLabel("시나리오 JSON 파일 선택").setInputFiles({
    name: "e2e.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(buildE2eScenario())),
  });
  await expect(gm).toHaveURL(/\/builder\/[0-9a-f-]+\/edit/);
  const scenarioId = gm.url().match(/builder\/([0-9a-f-]+)\/edit/)![1];

  await gm.goto(`/builder/${scenarioId}/publish`);
  const ack = gm.getByLabel(/위 경고를 확인했고/);
  if (await ack.isVisible().catch(() => false)) await ack.check();
  await gm.getByRole("button", { name: "발행하기" }).click();
  await expect(gm.getByText(/으로 발행했습니다/)).toBeVisible();

  await gm.goto("/builder");
  await gm.getByRole("button", { name: "방 만들기" }).first().click();
  await expect(gm).toHaveURL(/\/room\/[0-9a-f-]+/);
  const code = (await gm.locator("span.font-mono").first().innerText()).trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

  // ---------------- 참가자 3명: 초대 링크로 입장 (로그인 없음) ----------------
  const players: Player[] = [];
  for (const nickname of ["탐정A", "탐정B", "탐정C"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("dialog", (d) => void d.accept());
    const received: string[] = [];
    recordTraffic(page, received);
    await page.goto(`/join/${code}`);
    await page.getByLabel("닉네임").fill(nickname);
    await page.getByRole("button", { name: "입장하기" }).click();
    await expect(page).toHaveURL(/\/room\/[0-9a-f-]+/);
    await page.getByRole("button", { name: "준비 완료" }).click();
    players.push({ page, context, nickname, received });
  }

  // 새로고침해도 같은 방으로 돌아온다 (재접속 복구)
  await players[0].page.reload();
  await expect(players[0].page.getByText(code)).toBeVisible();

  // ---------------- GM: 배정 → 시작 ----------------
  await expect(gm.getByText("준비 3 / 3")).toBeVisible();
  await gm.getByRole("button", { name: /랜덤 배정/ }).click();
  await gm.getByRole("button", { name: "게임 시작" }).click();
  for (const p of players) {
    await expect(p.page.getByText("나만 아는 비밀")).toBeVisible();
  }

  // 각자 자기 비밀만 받았다
  for (const p of players) {
    const joined = p.received.join("\n");
    const mine = SECRETS.filter((s) => joined.includes(s));
    expect(mine, `${p.nickname} 가 받은 비밀`).toHaveLength(1);
  }

  // ---------------- 라운드: 오프닝 → 자기소개 → 탐색 ----------------
  await startRoundNamed(gm, "오프닝");
  await gm.getByRole("button", { name: "라운드 종료" }).click();
  await startRoundNamed(gm, "자기소개");
  await gm.getByRole("button", { name: "라운드 종료" }).click();
  await startRoundNamed(gm, "탐색");

  // 카드 뽑기와 채팅
  const [a, b] = players;
  await a.page.getByRole("button", { name: "카드 뽑기" }).click();
  await expect(a.page.getByText(/증거 보관함 \(1\)/)).toBeVisible();
  await a.page.getByLabel("채팅 메시지").fill("안녕하세요 E2E");
  await a.page.getByRole("button", { name: "보내기" }).click();
  await expect(b.page.getByText("안녕하세요 E2E")).toBeVisible();
  await expect(gm.getByText("안녕하세요 E2E")).toBeVisible();
  // 참가자 화면의 채팅에는 닉네임이 아니라 인물 이름이 보인다
  await expect(b.page.getByText("(탐정A)")).toHaveCount(0);

  // 귓속말: 받는 사람과 GM 만 보고, 나머지 한 명은 어떤 응답으로도 받지 못한다
  const c = players[2];
  await a.page.getByRole("tab", { name: "귓속말" }).click();
  await a.page.getByLabel("귓속말 상대").selectOption({ index: 1 });
  await a.page.getByLabel("채팅 메시지").fill("E2E-WHISPER 비밀 이야기");
  await a.page.getByRole("button", { name: "보내기" }).click();
  await expect(gm.getByText("E2E-WHISPER 비밀 이야기")).toBeVisible();
  const heardWhisper = () =>
    [b, c].filter((p) =>
      p.received.join("\n").includes("E2E-WHISPER 비밀 이야기"),
    ).length;
  await expect.poll(heardWhisper, { timeout: 20_000 }).toBe(1);
  await a.page.waitForTimeout(3_000);
  expect(heardWhisper(), "귓속말을 받은 참가자 수").toBe(1);

  // 미션: 자가 보고 → GM 승인. 숨김 미션은 참가자에게 내려오지 않는다.
  await a.page.getByRole("button", { name: "달성했어요" }).click();
  await expect(a.page.getByText("GM 확인 대기")).toBeVisible();
  await expect(gm.getByText(/확인 대기 1/)).toBeVisible({ timeout: 20_000 });
  await gm.getByRole("button", { name: "승인(달성)" }).first().click();
  await expect(a.page.getByText("달성", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  for (const p of players)
    expect(p.received.join("\n"), `${p.nickname}: 숨김 미션`).not.toContain(
      "E2E-HIDDEN-MISSION",
    );

  // 테이블 화면: GM 만 열 수 있고, 공개 정보만 보인다 (비밀·귓속말·개인 단서 없음)
  const table = await gmContext.newPage();
  await table.goto(
    gm.url().replace(/\/room\/([0-9a-f-]+).*/, "/room/$1/table"),
  );
  await expect(table.getByText(code)).toBeVisible();
  await expect(table.getByText(/E2E 오프닝/)).toBeVisible();
  const tableText = await table.locator("body").innerText();
  for (const secret of [...SECRETS, "E2E-WHISPER", "E2E-PRIVATE-BODY"])
    expect(tableText, `테이블 화면의 ${secret}`).not.toContain(secret);
  await table.close();

  await a.page.goto(
    a.page.url().replace(/\/room\/([0-9a-f-]+).*/, "/room/$1/table"),
  );
  await expect(
    a.page.getByText("테이블 화면은 GM만 열 수 있습니다"),
  ).toBeVisible();
  await a.page.goBack();

  // 미획득 비밀 단서는 다른 참가자가 받은 응답에 없다 (A 가 개인 단서를 뽑았다면 B 는 받지 못해야 한다)
  const privateDrawnByA = a.received.join("\n").includes("E2E-PRIVATE-BODY");
  if (privateDrawnByA)
    expect(b.received.join("\n")).not.toContain("E2E-PRIVATE-BODY");

  // ---------------- 토론 → 심화 → 투표 ----------------
  await gm.getByRole("button", { name: "라운드 종료" }).click();
  await startRoundNamed(gm, "토론");
  await gm.getByRole("button", { name: "라운드 종료" }).click();
  await startRoundNamed(gm, "심화");
  await gm.getByRole("button", { name: "라운드 종료" }).click();
  await startRoundNamed(gm, "투표");

  for (const p of players) {
    await expect(p.page.getByText("범인 투표")).toBeVisible();
    await p.page.locator('input[name="vote-target"]').first().check();
    await p.page.getByRole("button", { name: "투표하기" }).click();
    await expect(p.page.getByText(/에게\s*투표했습니다/)).toBeVisible();
  }
  await expect(gm.getByText(/모든 참가자가 투표했습니다/)).toBeVisible();

  // ---------------- 결말: 종료 전에는 진실이 어디에도 없다 ----------------
  for (const p of players)
    expect(p.received.join("\n"), `${p.nickname}: 종료 전 진실`).not.toContain(
      "E2E-TRUTH",
    );

  await gm.getByRole("button", { name: "라운드 종료" }).click();
  await gm.getByRole("button", { name: "게임 종료" }).click();
  for (const p of players) {
    await expect(p.page.getByText("투표 결과")).toBeVisible();
    expect(p.received.join("\n")).not.toContain("E2E-TRUTH");
  }

  await gm.getByRole("button", { name: "진실 공개" }).click();
  for (const p of players) {
    await expect(p.page.getByText(/E2E-TRUTH/)).toBeVisible();
    // 숨김 미션은 이때 미션 달성표로 공개된다
    await expect(p.page.getByText("E2E-HIDDEN-MISSION")).toBeVisible();
  }
  await gm.getByRole("button", { name: "후일담 공개" }).click();
  for (const p of players)
    await expect(p.page.getByText("E2E 후일담 집사")).toBeVisible();

  // 끝까지 다른 사람의 비밀은 받지 않았다
  for (const p of players) {
    const joined = p.received.join("\n");
    expect(SECRETS.filter((s) => joined.includes(s))).toHaveLength(1);
  }

  for (const p of players) await p.context.close();
  await gmContext.close();
});
