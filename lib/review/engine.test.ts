import { describe, expect, it } from "vitest";
import { ambiguousReply, createOrderFromScenario, reopenReply, scenario, scriptedReplies } from "@/lib/scenario";
import {
  applyDecision,
  applyReply,
  buildDraft,
  buildSummary,
  issueById,
  recordOutbound,
  reviewOrder,
} from "@/lib/review/engine";
import type { Order } from "@/lib/types";

function reviewed(): Order {
  const result = reviewOrder(createOrderFromScenario());
  if (!result.ok) throw new Error(result.error);
  return result.order;
}

function mustReply(order: Order, message: Order["messages"][number]): Order {
  const result = applyReply(order, message);
  if (!result.ok) throw new Error(result.error);
  return result.order;
}

describe("DEMO-001 review", () => {
  it("finds the three high-priority issues and keeps every quote inside the cited message", () => {
    const order = reviewed();
    const highs = order.issues.filter((issue) => issue.priority === "high").map((issue) => issue.issue_id);
    expect(highs).toEqual(["delivery_milestone", "sample_version", "inserts_scope"]);

    for (const expected of scenario.expected_issues) {
      const issue = issueById(order, expected.id);
      expect(issue?.kind).toBe(expected.kind);
      expect(issue?.priority).toBe("high");
      for (const evidence of expected.evidence) {
        expect(issue?.evidence).toEqual(expect.arrayContaining([evidence]));
        const message = order.messages.find((item) => item.id === evidence.message_id);
        expect(message?.body.includes(evidence.quote)).toBe(true);
      }
    }

    const delivery = issueById(order, "delivery_milestone");
    expect(delivery?.status).toBe("unconfirmed");
    expect(delivery?.impact).toMatch(/里程碑/);
    expect(delivery?.impact).toMatch(/不能据此断言运输一定来不及/);

    expect(issueById(order, "sample_version")?.impact).toMatch(/不能自动采用/);
    expect(issueById(order, "inserts_scope")?.impact).toMatch(/不能假设包含/);
    expect(order.issues.find((issue) => issue.issue_id === "quantity")).toBeUndefined();
    expect(order.facts.find((fact) => fact.id === "quantity")).toMatchObject({
      status: "confirmed",
      value: "1,000 套",
    });
    expect(order.facts.find((fact) => fact.id === "box_price")?.scope_note).toMatch(/只覆盖盒子/);
    expect(order.issues.filter((issue) => issue.priority === "low").map((issue) => issue.issue_id)).toEqual([
      "shipping_charges",
      "payment_terms",
      "acceptance_process",
    ]);
  });

  it("lets a partial sample confirmation close only the version issue", () => {
    const order = mustReply(reviewed(), {
      id: "m-partial",
      source: "manual",
      from_role: "seller",
      sent_at: "2026-10-24T10:05:00Z",
      subject: "Re: sample",
      body: "We confirm sample v2.",
    });

    expect(issueById(order, "sample_version")).toMatchObject({
      status: "confirmed",
      value: "sample v2",
    });
    expect(issueById(order, "delivery_milestone")?.status).toBe("unconfirmed");
    expect(issueById(order, "inserts_scope")?.status).toBe("unconfirmed");
    expect(issueById(order, "shipping_charges")?.status).toBe("unconfirmed");

    for (const evidence of issueById(order, "sample_version")?.resolution_evidence ?? []) {
      const message = order.messages.find((item) => item.id === evidence.message_id);
      expect(message?.body.includes(evidence.quote)).toBe(true);
    }
  });

  it("does not close anything from an ambiguous reply", () => {
    const start = reviewed();
    const before = start.issues.map((issue) => ({ id: issue.issue_id, status: issue.status }));
    const english = mustReply(start, ambiguousReply());
    expect(english.issues.map((issue) => ({ id: issue.issue_id, status: issue.status }))).toEqual(before);

    const chinese = mustReply(english, {
      id: "m-vague-zh",
      source: "manual",
      from_role: "seller",
      sent_at: "2026-10-24T12:05:00Z",
      subject: "Re: schedule",
      body: "应该赶得上，按之前说的办。",
    });
    expect(chinese.issues.map((issue) => issue.status)).toEqual(before.map((issue) => issue.status));
    expect(buildSummary(chinese).agreement_status).toBe("incomplete");
  });
});

describe("reply sequence and summary", () => {
  it("advances only the related issue on the buyer sample reply, then confirms the package when both sides accept", () => {
    let order = reviewed();
    const sent = recordOutbound(order, {
      to: order.buyer.email,
      subject: "Please confirm",
      body: "Could you confirm sample v2, London delivery, and protective inserts? This does not change the order yet.",
      issueIds: ["delivery_milestone", "sample_version", "inserts_scope"],
      sent_at: "2026-10-24T09:40:00Z",
    });
    if (!sent.ok) throw new Error(sent.error);
    order = sent.order;
    expect(order.outbound[0].delivery_status).toBe("recorded_not_sent");
    expect(order.outbound[0].note).toMatch(/没有调用 Amazon SES/);
    expect(issueById(order, "sample_version")?.status).toBe("question_sent");

    const replayed = reviewOrder(order);
    if (!replayed.ok) throw new Error(replayed.error);
    expect(issueById(replayed.order, "sample_version")?.status).toBe("question_sent");

    const [m4, m5, m6] = scriptedReplies();
    order = mustReply(order, m4);
    expect(issueById(order, "sample_version")?.status).not.toBe("confirmed");
    expect(issueById(order, "delivery_milestone")?.status).toBe("question_sent");
    expect(issueById(order, "inserts_scope")?.status).toBe("question_sent");
    expect(issueById(order, "sample_version")?.history.some((event) => event.reason.includes("不能当成双方已确认"))).toBe(true);

    order = mustReply(order, m5);
    expect(issueById(order, "sample_version")?.status).toBe("confirmed");
    expect(issueById(order, "delivery_milestone")?.status).toBe("proposed");
    expect(issueById(order, "inserts_scope")?.status).toBe("proposed");
    expect(issueById(order, "shipping_charges")?.status).toBe("proposed");
    expect(issueById(order, "payment_terms")?.status).toBe("proposed");
    expect(issueById(order, "acceptance_process")?.status).toBe("proposed");
    expect(buildSummary(order).agreement_status).toBe("incomplete");

    const vague = applyReply(order, {
      id: "m-vague-mid",
      source: "manual",
      from_role: "buyer",
      sent_at: "2026-10-24T10:40:00Z",
      subject: "Re:",
      body: "No worries, it should be fine. Let's proceed as discussed.",
    });
    if (!vague.ok) throw new Error(vague.error);
    expect(issueById(vague.order, "delivery_milestone")?.status).toBe("proposed");
    expect(issueById(vague.order, "inserts_scope")?.status).toBe("proposed");

    order = mustReply(order, m6);
    expect(order.issues.every((issue) => issue.status === "confirmed")).toBe(true);
    const summary = buildSummary(order);
    expect(summary.agreement_status).toBe("key_terms_confirmed");
    expect(summary.fulfillment_status).toBe("not_started_or_unknown");
    expect(summary.snapshot).toEqual({
      sample: "v2",
      quantity_sets: "1000",
      scope: "one box and one protective insert per set",
      unit_price_per_set: "2.60",
      goods_subtotal: "2600",
      shipping_charge: "300",
      order_total: "2900",
      delivery_milestone: "delivery at LONDON-DEMO-ADDRESS",
      delivery_deadline: "20 November 2026",
      payment: "30% deposit, 70% before dispatch",
      acceptance: "3-day quantity and visible-condition check",
    });
    expect(summary.next_action).toMatch(/形式发票/);
    expect(summary.notes.join(" ")).toMatch(/精确截止时刻没有约定/);
    expect(summary.open).toHaveLength(0);
    expect(JSON.stringify(summary)).not.toMatch(/已发货|已付款|已履约/);
    expect(order.facts.find((fact) => fact.id === "box_price")?.status).toBe("historical");
  });

  it("reopens sample version after a later substitution and leaves the other terms confirmed", () => {
    let order = reviewed();
    for (const message of scriptedReplies()) order = mustReply(order, message);
    order = mustReply(order, reopenReply());

    expect(issueById(order, "sample_version")?.status).toBe("reopened");
    expect(issueById(order, "sample_version")?.value).toMatch(/sample v1/);
    expect(issueById(order, "sample_version")?.impact).toMatch(/不会自动接受 v1/);
    expect(issueById(order, "delivery_milestone")?.status).toBe("confirmed");
    expect(issueById(order, "inserts_scope")?.status).toBe("confirmed");
    const summary = buildSummary(order);
    expect(summary.agreement_status).toBe("incomplete");
    expect(summary.snapshot.sample).toBeUndefined();
    expect(summary.confirmed.find((line) => line.issue_id === "sample_version")).toBeUndefined();
  });

  it("ignores a duplicate inbound message", () => {
    const once = mustReply(reviewed(), scriptedReplies()[0]);
    const twice = applyReply(once, scriptedReplies()[0]);
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error).toMatch(/已经入账/);
    expect(twice.order.messages).toHaveLength(once.messages.length);
    expect(twice.order.issues.map((issue) => issue.history.length)).toEqual(once.issues.map((issue) => issue.history.length));
  });

  it("requires a reason before accepting risk and does not treat that as mutual agreement", () => {
    const order = reviewed();
    const missing = applyDecision(order, "delivery_milestone", "accepted_risk", "  ");
    expect(missing.ok).toBe(false);
    const decided = applyDecision(order, "delivery_milestone", "accepted_risk", "客户书面接受可能晚到的风险。", {
      actor: "Lin",
      at: "2026-10-24T09:20:00Z",
    });
    if (!decided.ok) throw new Error(decided.error);
    expect(issueById(decided.order, "delivery_milestone")).toMatchObject({
      status: "accepted_risk",
      decision_actor: "Lin",
    });
    const summary = buildSummary(decided.order);
    expect(summary.agreement_status).toBe("incomplete");
    expect(summary.accepted_risk.map((line) => line.issue_id)).toEqual(["delivery_milestone"]);
    expect(summary.confirmed.find((line) => line.issue_id === "delivery_milestone")).toBeUndefined();
  });

  it("uses the canonical English draft only while the three issues are still open", () => {
    const order = reviewed();
    const draft = buildDraft(order, ["sample_version", "delivery_milestone", "inserts_scope"]);
    expect(draft.subject).toBe(scenario.draft_example.subject);
    expect(draft.body).toBe(scenario.draft_example.body);
    expect(draft.body).toMatch(/do not change the order terms/);
  });
});
