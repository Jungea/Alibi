import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@supabase/supabase-js";

import { GET } from "./route";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

function request(token = "test-health-token") {
  return new Request("http://localhost/api/health", {
    headers: { "X-Health-Token": token },
  });
}

describe("GET /api/health", () => {
  beforeEach(() => {
    process.env.HEALTH_CHECK_TOKEN = "test-health-token";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.HEALTH_CHECK_TOKEN;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("토큰이 다르면 Supabase를 호출하지 않고 401을 반환한다", async () => {
    const response = await GET(request("wrong-token"));

    expect(response.status).toBe(401);
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it("DB가 응답하면 200을 반환한다", async () => {
    const abortSignal = vi.fn().mockResolvedValue({ data: true, error: null });
    const rpc = vi.fn().mockReturnValue({ abortSignal });
    mockedCreateClient.mockReturnValue({ rpc } as never);

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(rpc).toHaveBeenCalledWith("health_check");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("DB 오류가 나면 상세 내용 없이 503을 반환한다", async () => {
    const abortSignal = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });
    mockedCreateClient.mockReturnValue({
      rpc: vi.fn().mockReturnValue({ abortSignal }),
    } as never);

    const response = await GET(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "error" });
  });
});
