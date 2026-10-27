import { describe, expect, it } from "vitest";
import { beats, closing, footer, hero, honesty, mockCaption } from "@/components/landing/content";

const buzzwords = ["赋能", "闭环", "全方位", "一站式", "智能核对", "可观测", "解决方案", "抓手", "矩阵"];

describe("landing copy", () => {
  const text = JSON.stringify({ beats, closing, footer, hero, honesty, mockCaption });

  it("sends people to the workspace and stays inside the demo", () => {
    expect(hero.primary.href).toBe("/workspace");
    expect(hero.secondary.href).toBe("/workspace");
    expect(closing.primary.href).toBe("/workspace");
    expect(text).toContain("DEMO");
    expect(honesty.chips).toEqual(["DeepSeek", "证据链", "外发可审计"]);
  });

  it("keeps the page to a headline, one line, and three short beats", () => {
    expect(beats).toHaveLength(3);
    expect(hero.title.length).toBeLessThanOrEqual(24);
    expect(hero.line.length).toBeLessThanOrEqual(20);
    expect(closing.line.length).toBeLessThanOrEqual(16);
    for (const beat of beats) {
      expect(beat.title.length).toBeGreaterThanOrEqual(4);
      expect(beat.title.length).toBeLessThanOrEqual(8);
      expect(beat.line.replace(/[，。、]/g, "").length).toBeLessThanOrEqual(16);
    }
  });

  it("does not use brochure language, lift numbers, or fake customers", () => {
    for (const word of buzzwords) expect(text).not.toContain(word);
    expect(text).not.toMatch(/\d+\s*%/);
    expect(text).not.toMatch(/屈臣氏|蔚来|Singtel|Telkom|提升|节省|降低了/);
  });
});
