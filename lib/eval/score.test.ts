import { describe, expect, it } from "vitest";
import { EVAL_CASES } from "@/lib/eval/fixtures";
import { formatEvalReport, scoreDeterministic } from "@/lib/eval/score";

const report = scoreDeterministic();

describe("deterministic eval fixtures", () => {
  it("covers the required scenario families", () => {
    const covers = EVAL_CASES.map((item) => item.covers).join(" ");
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(8);
    expect(covers).toMatch(/quantity/);
    expect(covers).toMatch(/milestone/);
    expect(covers).toMatch(/sample/);
    expect(covers).toMatch(/price/);
    expect(covers).toMatch(/shipping/);
    expect(covers).toMatch(/payment/);
  });

  it(`checklist ${report.checklistPassed}/${report.checklistTotal} precision ${report.microPrecision} recall ${report.microRecall}`, () => {
    const failed = report.cases.filter((item) => !item.pass);
    expect(failed, formatEvalReport(report)).toEqual([]);
    expect(report.checklistPassed).toBe(report.checklistTotal);
    expect(report.microPrecision).toBe(1);
    expect(report.microRecall).toBe(1);
  });
});
