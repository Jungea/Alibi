import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("클래스를 합치고 충돌하는 Tailwind 클래스는 뒤의 것을 따른다", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("falsy 값은 무시한다", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });
});
