import type { Order, Role } from "@/lib/types";

export interface EvalCase {
  id: string;
  title: string;
  /** What a judge should recognize in this case. */
  covers: string;
  messages: Array<{ id: string; from_role: Role; body: string }>;
  /** Issue codes the deterministic engine must emit. */
  expectedIssueIds: string[];
  /** Issue codes that must not be emitted. `quantity` is never an issue code when both sides agreed. */
  forbiddenIssueIds: string[];
  expectedStatus?: Record<string, string>;
  expectedFact?: { id: string; status: string };
}

const BUYER = "buyer" as const;
const SELLER = "seller" as const;

/**
 * Phrases match the deterministic extractor on purpose.
 * This scores the rule engine's contract, not a live model.
 */
export const EVAL_CASES: EvalCase[] = [
  {
    id: "agreed-quantity-not-reasked",
    title: "双方已写明数量，不再追问",
    covers: "agreed quantity is a fact, not a new issue",
    messages: [
      { id: "q1", from_role: BUYER, body: "Hi Lin, we would like 1,000 custom gift packaging sets." },
      { id: "q2", from_role: SELLER, body: "Hi Emma, quantity 1,000 is confirmed." },
    ],
    expectedIssueIds: [],
    forbiddenIssueIds: ["quantity", "delivery_milestone", "sample_version", "inserts_scope", "shipping_charges", "payment_terms", "acceptance_process"],
    expectedFact: { id: "quantity", status: "confirmed" },
  },
  {
    id: "milestone-mismatch",
    title: "同一日期，到货与提货不是同一个里程碑",
    covers: "milestone mismatch",
    messages: [
      { id: "d1", from_role: BUYER, body: "We need them delivered to our London warehouse by 20 November 2026." },
      { id: "d2", from_role: SELLER, body: "They will be ready for collection in Shanghai on 20 November 2026." },
    ],
    expectedIssueIds: ["delivery_milestone"],
    forbiddenIssueIds: ["quantity", "sample_version"],
    expectedStatus: { delivery_milestone: "unconfirmed" },
  },
  {
    id: "sample-version-mismatch",
    title: "买方 sample v2，报价 sample v1",
    covers: "sample version mismatch",
    messages: [
      { id: "s1", from_role: BUYER, body: "Please quote 1,000 sets based on sample v2." },
      { id: "s2", from_role: SELLER, body: "Quotation Q-001. Product: custom gift boxes based on sample v1." },
    ],
    expectedIssueIds: ["sample_version"],
    forbiddenIssueIds: ["quantity", "delivery_milestone"],
    expectedStatus: { sample_version: "unconfirmed" },
  },
  {
    id: "price-incomplete-inserts",
    title: "买方要内托，卖方只报了盒子单价",
    covers: "price incomplete",
    messages: [
      { id: "p1", from_role: BUYER, body: "We need the sets including the protective inserts." },
      { id: "p2", from_role: SELLER, body: "The boxes are USD 2.40 each." },
    ],
    expectedIssueIds: ["inserts_scope"],
    forbiddenIssueIds: ["quantity", "shipping_charges", "payment_terms"],
    expectedStatus: { inserts_scope: "unconfirmed" },
    expectedFact: { id: "box_price", status: "stated_by_one_party" },
  },
  {
    id: "shipping-gap",
    title: "运费另议，没有金额",
    covers: "shipping gap",
    messages: [{ id: "h1", from_role: SELLER, body: "Shipping charges will be agreed separately." }],
    expectedIssueIds: ["shipping_charges"],
    forbiddenIssueIds: ["payment_terms", "acceptance_process", "quantity"],
    expectedStatus: { shipping_charges: "unconfirmed" },
  },
  {
    id: "payment-gap",
    title: "付款条件另议",
    covers: "payment gap",
    messages: [{ id: "y1", from_role: SELLER, body: "payment terms will be agreed separately." }],
    expectedIssueIds: ["payment_terms"],
    forbiddenIssueIds: ["shipping_charges", "acceptance_process", "quantity"],
    expectedStatus: { payment_terms: "unconfirmed" },
  },
  {
    id: "acceptance-gap",
    title: "验收方式另议",
    covers: "acceptance gap",
    messages: [{ id: "a1", from_role: SELLER, body: "the acceptance process will be agreed separately." }],
    expectedIssueIds: ["acceptance_process"],
    forbiddenIssueIds: ["shipping_charges", "payment_terms", "quantity"],
    expectedStatus: { acceptance_process: "unconfirmed" },
  },
  {
    id: "shipping-payment-acceptance-gaps",
    title: "运费、付款、验收都还没约定",
    covers: "shipping, payment, and acceptance gaps together",
    messages: [
      {
        id: "g1",
        from_role: SELLER,
        body: "Shipping charges, payment terms and the acceptance process will be agreed separately.",
      },
    ],
    expectedIssueIds: ["shipping_charges", "payment_terms", "acceptance_process"],
    forbiddenIssueIds: ["quantity", "delivery_milestone", "sample_version", "inserts_scope"],
  },
  {
    id: "quantity-agreed-milestone-open",
    title: "数量已对齐，交付里程碑仍未对齐",
    covers: "agreed quantity is not re-asked while a milestone mismatch stays open",
    messages: [
      {
        id: "m1",
        from_role: BUYER,
        body: "Hi Lin, we would like 1,000 custom gift packaging sets. We need them delivered to our London warehouse by 20 November 2026.",
      },
      {
        id: "m2",
        from_role: SELLER,
        body: "quantity 1,000 is confirmed. They will be ready for collection in Shanghai on 20 November 2026.",
      },
    ],
    expectedIssueIds: ["delivery_milestone"],
    forbiddenIssueIds: ["quantity", "sample_version", "inserts_scope"],
    expectedStatus: { delivery_milestone: "unconfirmed" },
    expectedFact: { id: "quantity", status: "confirmed" },
  },
  {
    id: "price-proposed-not-confirmed",
    title: "整套价格只是卖方提议",
    covers: "price incomplete until the buyer accepts the set price",
    messages: [
      { id: "r1", from_role: BUYER, body: "Please include the goods including the protective inserts." },
      {
        id: "r2",
        from_role: SELLER,
        body: "Our updated offer is each including one box and one protective insert, at USD 2.60 per set.",
      },
    ],
    expectedIssueIds: ["inserts_scope"],
    forbiddenIssueIds: ["quantity"],
    expectedStatus: { inserts_scope: "proposed" },
  },
  {
    id: "demo-001-opening",
    title: "DEMO-001 开场三封邮件",
    covers: "milestone mismatch, sample mismatch, incomplete price, shipping and payment gaps; quantity not re-asked",
    messages: [
      {
        id: "m1",
        from_role: BUYER,
        body: "Hi Lin, we would like 1,000 custom gift packaging sets based on sample v2, including the protective inserts. We need them delivered to our London warehouse by 20 November 2026. The delivery address is LONDON-DEMO-ADDRESS. Please confirm the price and schedule.",
      },
      {
        id: "m2",
        from_role: SELLER,
        body: "Hi Emma, quantity 1,000 is confirmed. The boxes are USD 2.40 each. They will be ready for collection in Shanghai on 20 November 2026. Please see the quotation text below.",
      },
      {
        id: "m3",
        from_role: SELLER,
        body: "Quotation Q-001. Product: custom gift boxes based on sample v1. Quantity: 1,000. Unit price: USD 2.40 per box. Boxes subtotal: USD 2,400. Shipping charges, payment terms and the acceptance process will be agreed separately.",
      },
    ],
    expectedIssueIds: [
      "delivery_milestone",
      "sample_version",
      "inserts_scope",
      "shipping_charges",
      "payment_terms",
      "acceptance_process",
    ],
    forbiddenIssueIds: ["quantity"],
    expectedStatus: {
      delivery_milestone: "unconfirmed",
      sample_version: "unconfirmed",
      inserts_scope: "unconfirmed",
      shipping_charges: "unconfirmed",
      payment_terms: "unconfirmed",
      acceptance_process: "unconfirmed",
    },
    expectedFact: { id: "quantity", status: "confirmed" },
  },
];

export function orderFromEvalCase(testCase: EvalCase): Order {
  return {
    id: `EVAL-${testCase.id}`,
    name: testCase.title,
    stage: "before_order_confirmation",
    buyer: { name: "Emma", email: "buyer@example.com", country: "UK" },
    seller: { name: "Lin", email: "seller@example.com", country: "China" },
    reviewer: "seller",
    messages: testCase.messages.map((message, index) => ({
      id: message.id,
      source: "fixture" as const,
      from_role: message.from_role,
      sent_at: `2026-10-24T08:${String(index).padStart(2, "0")}:00Z`,
      subject: "Eval",
      body: message.body,
    })),
    issues: [],
    facts: [],
    outbound: [],
    reviewed: false,
  };
}
