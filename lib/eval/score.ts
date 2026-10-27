import { reviewOrder } from "@/lib/review/engine";
import { EVAL_CASES, orderFromEvalCase, type EvalCase } from "@/lib/eval/fixtures";

export interface CaseScore {
  id: string;
  title: string;
  pass: boolean;
  expected: string[];
  predicted: string[];
  missing: string[];
  unexpected: string[];
  precision: number;
  recall: number;
  notes: string[];
}

export interface EvalReport {
  cases: CaseScore[];
  checklistPassed: number;
  checklistTotal: number;
  /** Micro precision over issue codes. Empty gold and empty prediction count as 1. */
  microPrecision: number;
  microRecall: number;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return numerator === 0 ? 1 : 0;
  return numerator / denominator;
}

export function scoreCase(testCase: EvalCase): CaseScore {
  const notes: string[] = [];
  const result = reviewOrder(orderFromEvalCase(testCase));
  if (!result.ok) {
    return {
      id: testCase.id,
      title: testCase.title,
      pass: false,
      expected: testCase.expectedIssueIds,
      predicted: [],
      missing: [...testCase.expectedIssueIds],
      unexpected: [],
      precision: 0,
      recall: testCase.expectedIssueIds.length === 0 ? 1 : 0,
      notes: [result.error],
    };
  }

  const predicted = result.order.issues.map((issue) => issue.issue_id);
  const predictedSet = new Set(predicted);
  const expectedSet = new Set(testCase.expectedIssueIds);
  const missing = testCase.expectedIssueIds.filter((id) => !predictedSet.has(id));
  const unexpected = predicted.filter((id) => !expectedSet.has(id));
  const forbidden = testCase.forbiddenIssueIds.filter((id) => predictedSet.has(id));
  const truePositive = testCase.expectedIssueIds.filter((id) => predictedSet.has(id)).length;

  if (testCase.expectedStatus) {
    for (const [id, status] of Object.entries(testCase.expectedStatus)) {
      const actual = result.order.issues.find((issue) => issue.issue_id === id)?.status;
      if (actual !== status) notes.push(`${id} status ${actual ?? "missing"} !== ${status}`);
    }
  }
  if (testCase.expectedFact) {
    const fact = result.order.facts.find((item) => item.id === testCase.expectedFact?.id);
    if (!fact) notes.push(`missing fact ${testCase.expectedFact.id}`);
    else if (fact.status !== testCase.expectedFact.status) {
      notes.push(`fact ${fact.id} status ${fact.status} !== ${testCase.expectedFact.status}`);
    }
  }
  if (forbidden.length) notes.push(`forbidden present: ${forbidden.join(",")}`);

  const pass = missing.length === 0 && unexpected.length === 0 && forbidden.length === 0 && notes.length === 0;
  return {
    id: testCase.id,
    title: testCase.title,
    pass,
    expected: testCase.expectedIssueIds,
    predicted,
    missing,
    unexpected,
    precision: ratio(truePositive, predicted.length),
    recall: ratio(truePositive, testCase.expectedIssueIds.length),
    notes,
  };
}

export function scoreDeterministic(cases: EvalCase[] = EVAL_CASES): EvalReport {
  const scored = cases.map((testCase) => scoreCase(testCase));
  let truePositive = 0;
  let predicted = 0;
  let expected = 0;
  for (const item of scored) {
    const overlap = item.expected.filter((id) => item.predicted.includes(id)).length;
    truePositive += overlap;
    predicted += item.predicted.length;
    expected += item.expected.length;
  }
  return {
    cases: scored,
    checklistPassed: scored.filter((item) => item.pass).length,
    checklistTotal: scored.length,
    microPrecision: ratio(truePositive, predicted),
    microRecall: ratio(truePositive, expected),
  };
}

export function formatEvalReport(report: EvalReport): string {
  const lines = [
    `checklist ${report.checklistPassed}/${report.checklistTotal}`,
    `micro precision ${report.microPrecision.toFixed(3)}`,
    `micro recall ${report.microRecall.toFixed(3)}`,
  ];
  for (const item of report.cases) {
    const flag = item.pass ? "pass" : "fail";
    lines.push(
      `${flag} ${item.id} precision=${item.precision.toFixed(3)} recall=${item.recall.toFixed(3)} predicted=${item.predicted.join("|") || "-"}`,
    );
    for (const note of item.notes) lines.push(`  ${note}`);
  }
  return lines.join("\n");
}
