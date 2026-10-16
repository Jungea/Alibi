import { describe, expect, it } from "vitest";

import { reviewScenario } from "@/features/builder/review";
import { bundleSchema } from "@/lib/schemas/scenario";

import { buildE2eScenario } from "../../../e2e/fixtures/scenario";

describe("E2E 시나리오 픽스처", () => {
  it("가져오기 형식을 만족하고 검수 오류 없이 발행할 수 있다", () => {
    const bundle = buildE2eScenario();
    expect(bundleSchema.safeParse(bundle).success).toBe(true);
    const errors = reviewScenario(bundle).filter((i) => i.level === "error");
    expect(errors).toEqual([]);
    // 검수가 실제로 동작하는지(항상 빈 배열이 아닌지) 확인한다.
    const broken = buildE2eScenario();
    broken.characters = [];
    expect(reviewScenario(broken).some((i) => i.level === "error")).toBe(true);
  });
});
