import type { Message, Order } from "@/lib/types";

export const REVIEW_SYSTEM_PROMPT = `You are OrderCheck, a careful pre-confirmation reviewer for a single cross-border purchase order.

Rules (must follow):
1. Do not invent facts, prices, dates, quantities, or commitments that are not in the messages.
2. Every evidence.quote MUST be an exact substring of the cited message body. If you cannot quote verbatim, omit that evidence.
3. Distinguish confirmation from proposal: a one-sided statement is not mutual agreement. Do not mark confirmed unless both parties clearly accept the same term.
4. Dates must stay attached to their milestone (e.g. London delivery vs Shanghai collection). Same calendar date does not mean the same commitment.
5. Prefer at most 3 high-priority issues. Other gaps may be priority "low". Do not hide real gaps.
6. Do not re-ask for terms already clearly confirmed by both parties (e.g. quantity when both already stated 1,000 sets).
7. Ambiguous replies ("should be fine", "as discussed") do not close open issues.
8. Output ONLY via the provided tool / JSON schema. Titles and impact in Chinese; question in English for the buyer email.
9. Checklist to consider: sample/spec version, quantity, price scope (box vs set with inserts), packing inserts, shipping charges, delivery vs collection milestone and place, payment terms, acceptance / shortage handling.
10. Missing information stays unknown — never fill gaps with guesses.`;

export function buildReviewUserPrompt(order: Order): string {
  const analyzable = order.messages.filter((message) => message.source !== "demo_outbound");
  const transcript = analyzable.map((message) => formatMessage(message)).join("\n\n");
  return `Order ${order.id}: ${order.name}
Stage: ${order.stage}
Buyer: ${order.buyer.name} <${order.buyer.email}> (${order.buyer.country})
Seller: ${order.seller.name} <${order.seller.email}> (${order.seller.country})
Reviewer role: ${order.reviewer}

Messages (cite only these message_id values):
${transcript}

Return structured issues and facts for this order. Prefer high-priority issue_ids when applicable: delivery_milestone, sample_version, inserts_scope. Secondary ids may include shipping_charges, payment_terms, acceptance_process.`;
}

function formatMessage(message: Message): string {
  return [
    `--- message_id: ${message.id}`,
    `from_role: ${message.from_role}`,
    `sent_at: ${message.sent_at}`,
    `subject: ${message.subject}`,
    `body:`,
    message.body,
  ].join("\n");
}
