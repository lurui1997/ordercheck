import { scenario } from "@/lib/scenario";
import type { EmailDraft, Issue, Order } from "@/lib/types";

const CLOSED = new Set(["confirmed", "accepted_risk", "not_applicable"]);

function englishQuestion(issue: Issue): string {
  return issue.question;
}

export function buildDraft(order: Order, issueIds: string[]): EmailDraft {
  const selected = order.issues.filter((issue) => issueIds.includes(issue.issue_id));
  const canonical = ["delivery_milestone", "sample_version", "inserts_scope"];
  const selectedIds = selected.map((issue) => issue.issue_id);
  const exactCanonical =
    selectedIds.length === canonical.length && canonical.every((id) => selectedIds.includes(id));
  const allOpen = canonical.every((id) => {
    const issue = order.issues.find((item) => item.issue_id === id);
    return issue && !CLOSED.has(issue.status);
  });

  if (exactCanonical && allOpen) {
    return {
      from: order.seller.email,
      to: order.buyer.email,
      subject: scenario.draft_example.subject,
      body: scenario.draft_example.body,
      issue_ids: canonical,
    };
  }

  const lines = selected.filter((issue) => !CLOSED.has(issue.status)).map((issue, index) => {
    return `${index + 1}. ${englishQuestion(issue)}`;
  });
  const body = [
    `Hi ${order.buyer.name}, before we confirm the order, could we align on the following?`,
    "",
    ...lines,
    "",
    "These questions do not change the order terms until both sides confirm. This note does not promise a price, date, payment term, or remedy.",
  ].join("\n");

  return {
    from: order.seller.email,
    to: order.buyer.email,
    subject: `Please confirm open points before order confirmation - ${order.id}`,
    body,
    issue_ids: selected.filter((issue) => !CLOSED.has(issue.status)).map((issue) => issue.issue_id),
  };
}
