import { describe, expect, it } from "vitest";
import { closing, footer, hero, pillars, platform, scenarios } from "@/components/landing/content";

describe("landing copy", () => {
  const text = JSON.stringify({ closing, footer, hero, pillars, platform, scenarios });

  it("keeps claims inside the demo and names the workspace route", () => {
    expect(text).toContain("/workspace");
    expect(text).toContain("DEMO-001");
    expect(text).toContain("recorded_not_sent");
    expect(text).toContain("不是客户标识");
  });

  it("does not invent lift numbers or customer logos", () => {
    expect(text).not.toMatch(/\d+\s*%/);
    expect(text).not.toMatch(/屈臣氏|蔚来|Singtel|Telkom/);
    expect(text).not.toMatch(/提升|节省|降低了/);
  });
});
