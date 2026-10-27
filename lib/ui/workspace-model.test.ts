import { describe, expect, it } from "vitest";
import { reviewOrder } from "@/lib/review/engine";
import { createOrderFromScenario } from "@/lib/scenario";
import type { Order, RuntimeConfig } from "@/lib/types";
import {
  askIssueIds,
  commandState,
  compareOrders,
  defaultDraftIssueIds,
  enginePresentation,
  filterIssues,
  highlightQuotes,
  nextStepHint,
  persistencePresentation,
  pickInitialIssue,
  readApiError,
  sendAvailability,
  sesPresentation,
  splitByQuotes,
  statusTone,
} from "@/lib/ui/workspace-model";

function reviewed(): Order {
  const result = reviewOrder(createOrderFromScenario());
  if (!result.ok) throw new Error(result.error);
  return result.order;
}

const demoConfig = {
  mode: "demo",
  sesConfigured: false,
  sesLive: false,
  dynamoConfigured: false,
} as Pick<RuntimeConfig, "mode" | "sesConfigured" | "sesLive" | "dynamoConfigured">;

describe("workspace view model", () => {
  it("filters issues by priority and open state", () => {
    const order = reviewed();
    expect(filterIssues(order.issues, "open", "high").map((issue) => issue.issue_id)).toEqual([
      "delivery_milestone",
      "sample_version",
      "inserts_scope",
    ]);
    expect(filterIssues(order.issues, "closed", "all")).toHaveLength(0);
    expect(filterIssues([{ ...order.issues[0], status: "confirmed" }], "closed", "all")).toHaveLength(1);
  });

  it("picks a high open issue and drafts those ids first", () => {
    const order = reviewed();
    expect(pickInitialIssue(order)?.priority).toBe("high");
    expect(defaultDraftIssueIds(order)).toEqual(["delivery_milestone", "sample_version", "inserts_scope"]);
    const asked = {
      ...order,
      issues: order.issues.map((issue) =>
        issue.priority === "high" ? { ...issue, status: "question_sent" as const } : issue,
      ),
    };
    expect(defaultDraftIssueIds(asked).some((id) => id === "delivery_milestone")).toBe(false);
    expect(defaultDraftIssueIds(asked).length).toBeGreaterThan(0);
    expect(askIssueIds(order, "sample_version")).toEqual({ ok: true, ids: ["sample_version"] });
    expect(askIssueIds(createOrderFromScenario(), "sample_version").ok).toBe(false);
  });

  it("highlights only quotes that exist, preferring the longer match", () => {
    const order = reviewed();
    const issue = order.issues.find((item) => item.issue_id === "sample_version");
    const quotes = highlightQuotes(order, "sample_version", null);
    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes.every((item) => item.quote.length > 0)).toBe(true);
    const body = order.messages.find((message) => message.id === issue?.evidence[0]?.message_id)?.body ?? "";
    const parts = splitByQuotes(body, [issue?.evidence[0]?.quote ?? "", "not in the message"]);
    expect(parts.some((part) => part.mark)).toBe(true);
    expect(parts.map((part) => part.text).join("")).toBe(body);
    expect(splitByQuotes("sample v2 only", ["v2", "sample v2"])).toEqual([
      { text: "sample v2", mark: true },
      { text: " only", mark: false },
    ]);
  });

  it("compares issue status without relabeling a single engine", () => {
    const left = reviewed();
    const right: Order = {
      ...left,
      issues: left.issues.map((issue) => (issue.issue_id === "sample_version" ? { ...issue, status: "confirmed" } : issue)),
    };
    const comparison = compareOrders(left, right);
    expect(comparison.rows.find((row) => row.issue_id === "sample_version")?.agree).toBe(false);
    expect(comparison.disagreed).toBe(1);
    expect(compareOrders(left, left).disagreed).toBe(0);
    expect(compareOrders(left, left).summariesAgree).toBe(true);

    expect(enginePresentation("deterministic").detail).not.toMatch(/这次核对走 Amazon Bedrock/);
    expect(enginePresentation("deterministic").label).toBe("规则引擎");
    expect(enginePresentation("ai_gateway").detail).toMatch(/不是 Amazon Bedrock/);
    expect(enginePresentation("bedrock").code).toBe("bedrock");
    expect(persistencePresentation(demoConfig).label).toBe("浏览器");
    expect(sesPresentation({ sesLive: false }).label).toBe("SES 未发信");
    expect(statusTone("confirmed")).toBe("ok");
    expect(statusTone("unconfirmed")).toBe("danger");
  });

  it("disables commands with operator-facing reasons", () => {
    const blocked = commandState({
      hasOrder: false,
      reviewed: false,
      reviewBusy: false,
      compareBusy: false,
      draftBusy: false,
      sendBusy: false,
      hasDraft: false,
    });
    expect(blocked.review).toEqual({ disabled: true, reason: "先加载订单。" });
    expect(blocked.record.reason).toBe("先生成确认邮件。");
    expect(nextStepHint({ hasOrder: false, reviewed: false, hasDraft: false, sesLive: false })).toMatch(/DEMO-001/);

    const ready = commandState({
      hasOrder: true,
      reviewed: true,
      reviewBusy: false,
      compareBusy: false,
      draftBusy: false,
      sendBusy: false,
      hasDraft: true,
    });
    expect(ready.draft.disabled).toBe(false);
    expect(ready.record.disabled).toBe(false);
    expect(sendAvailability({ mode: "demo", sesConfigured: false, sesLive: false }).ses.disabled).toBe(true);
    expect(sendAvailability({ mode: "aws", sesConfigured: false, sesLive: false }).record.disabled).toBe(true);
    expect(sendAvailability({ mode: "aws", sesConfigured: true, sesLive: true }).ses.disabled).toBe(false);
  });

  it("keeps API error codes", () => {
    expect(readApiError({ error: { code: "bedrock_not_configured", message: "缺少配置" } }, "失败")).toEqual({
      code: "bedrock_not_configured",
      message: "缺少配置",
    });
  });
});
