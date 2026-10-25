import { describe, expect, it } from "vitest";
import {
  filterValidEvidence,
  quoteIsInMessage,
  sanitizeModelFacts,
  sanitizeModelIssues,
} from "@/lib/review/evidence";
import { createOrderFromScenario } from "@/lib/scenario";

describe("evidence quote validation", () => {
  const order = createOrderFromScenario();
  const messages = order.messages;

  it("accepts exact substrings and rejects invented quotes", () => {
    expect(quoteIsInMessage("hello world", "hello")).toBe(true);
    expect(quoteIsInMessage("hello world", "goodbye")).toBe(false);
    expect(quoteIsInMessage("hello world", "")).toBe(false);
    expect(quoteIsInMessage("hello world", "   ")).toBe(false);
  });

  it("keeps only evidence whose quote appears in the cited message", () => {
    const valid = filterValidEvidence(
      [
        { message_id: "m1", quote: "delivered to our London warehouse by 20 November 2026" },
        { message_id: "m1", quote: "this quote is not in the message" },
        { message_id: "missing-id", quote: "delivered to our London warehouse by 20 November 2026" },
      ],
      messages,
    );
    expect(valid).toEqual([
      { message_id: "m1", quote: "delivered to our London warehouse by 20 November 2026" },
    ]);
  });

  it("drops issues that have zero valid evidence after sanitization", () => {
    const result = sanitizeModelIssues(
      [
        {
          issue_id: "delivery_milestone",
          kind: "conflict",
          priority: "high",
          title: "到货与提货",
          evidence: [
            { message_id: "m1", quote: "delivered to our London warehouse by 20 November 2026" },
            { message_id: "m2", quote: "fabricated claim" },
          ],
          impact: "里程碑未对齐",
          question: "Please confirm delivery.",
          status: "unconfirmed",
          waiting_for: "seller",
          resolution_evidence: [],
        },
        {
          issue_id: "fake_issue",
          kind: "missing",
          priority: "high",
          title: "假问题",
          evidence: [{ message_id: "m1", quote: "totally made up" }],
          impact: "不应展示",
          question: "?",
          status: "unconfirmed",
          waiting_for: "both",
          resolution_evidence: [],
        },
      ],
      messages,
    );
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0].issue_id).toBe("delivery_milestone");
    expect(result.kept[0].evidence).toHaveLength(1);
    expect(result.dropped).toBe(1);
  });

  it("drops facts without valid evidence", () => {
    const result = sanitizeModelFacts(
      [
        {
          id: "quantity",
          label: "数量",
          value: "1,000 套",
          status: "confirmed",
          evidence: [{ message_id: "m1", quote: "1,000 custom" }],
        },
        {
          id: "ghost",
          label: "幽灵",
          value: "x",
          status: "proposed",
          evidence: [{ message_id: "m1", quote: "not present" }],
        },
      ],
      messages,
    );
    expect(result.kept.map((fact) => fact.id)).toEqual(["quantity"]);
    expect(result.dropped).toBe(1);
  });
});
