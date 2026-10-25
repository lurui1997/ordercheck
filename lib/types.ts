export type AppMode = "demo" | "aws";

export type Role = "buyer" | "seller";

export type MessageSource = "fixture" | "manual" | "ses_inbound" | "demo_outbound";

export type IssueKind = "missing" | "ambiguous" | "conflict";

export type Priority = "high" | "low";

export type IssueStatus =
  | "unconfirmed"
  | "question_sent"
  | "proposed"
  | "confirmed"
  | "needs_human_review"
  | "accepted_risk"
  | "reopened"
  | "not_applicable";

export type WaitingFor = "buyer" | "seller" | "both" | "none";

export type TermId =
  | "sample"
  | "delivery"
  | "inserts"
  | "shipping"
  | "payment"
  | "acceptance"
  | "quantity"
  | "box_price"
  | "goods_subtotal"
  | "order_total";

export type StanceKind = "request" | "offer" | "accept";

export interface Party {
  name: string;
  email: string;
  country: string;
}

export interface Evidence {
  message_id: string;
  quote: string;
}

export interface StatusEvent {
  at: string;
  from: IssueStatus | null;
  to: IssueStatus;
  message_id?: string;
  actor: string;
  reason: string;
}

export interface Issue {
  issue_id: string;
  kind: IssueKind;
  priority: Priority;
  title: string;
  evidence: Evidence[];
  impact: string;
  question: string;
  status: IssueStatus;
  waiting_for: WaitingFor;
  resolution_evidence: Evidence[];
  history: StatusEvent[];
  updated_at: string;
  value?: string;
  decision_reason?: string;
  decision_actor?: string;
}

export interface KnownFact {
  id: string;
  label: string;
  value: string;
  scope_note: string;
  status: "confirmed" | "stated_by_one_party" | "proposed" | "historical";
  evidence: Evidence[];
}

export interface Message {
  id: string;
  source: MessageSource;
  from_role: Role;
  sent_at: string;
  subject: string;
  body: string;
}

export type DeliveryStatus =
  | "recorded_not_sent"
  | "submit_succeeded"
  | "delivered"
  | "bounce"
  | "complaint"
  | "failed";

export interface OutboundEmail {
  id: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  created_at: string;
  mode: AppMode;
  delivery_status: DeliveryStatus;
  note: string;
  issue_ids: string[];
  /** SES MessageId when submit succeeded — used to match delivery/bounce/complaint events. */
  provider_message_id?: string;
}

export interface ReviewMeta {
  engine: ReviewEngine;
  bedrockRequestId?: string;
  gatewayUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  agentRetries?: number;
  reviewedAt?: string;
}

export interface Order {
  id: string;
  name: string;
  stage: string;
  buyer: Party;
  seller: Party;
  reviewer: Role;
  messages: Message[];
  issues: Issue[];
  facts: KnownFact[];
  outbound: OutboundEmail[];
  reviewed: boolean;
  reviewed_at?: string;
  /** Last remote review observability (engine + request id). */
  review_meta?: ReviewMeta;
}

export interface Stance {
  term: TermId;
  party: Role;
  messageId: string;
  quote: string;
  value: string;
  kind: StanceKind;
  at: string;
  pendingApproval?: boolean;
}

export type DecisionKind = "accepted_risk" | "needs_human_review" | "not_applicable";

export interface EmailDraft {
  from: string;
  to: string;
  subject: string;
  body: string;
  issue_ids: string[];
}

export interface SummaryLine {
  issue_id: string;
  title: string;
  status: IssueStatus;
  value?: string;
  detail: string;
  waiting_for: WaitingFor;
  evidence: Evidence[];
  reason?: string;
}

export interface AgreementSnapshot {
  sample?: "v2";
  quantity_sets?: "1000";
  scope?: "one box and one protective insert per set";
  unit_price_per_set?: "2.60";
  goods_subtotal?: "2600";
  shipping_charge?: "300";
  order_total?: "2900";
  delivery_milestone?: "delivery at LONDON-DEMO-ADDRESS";
  delivery_deadline?: "20 November 2026";
  payment?: "30% deposit, 70% before dispatch";
  acceptance?: "3-day quantity and visible-condition check";
}

export interface AgreementSummary {
  agreement_status: "key_terms_confirmed" | "incomplete";
  fulfillment_status: "not_started_or_unknown";
  confirmed: SummaryLine[];
  open: SummaryLine[];
  accepted_risk: SummaryLine[];
  not_applicable: SummaryLine[];
  single_party: SummaryLine[];
  snapshot: AgreementSnapshot;
  next_action: string;
  notes: string[];
}

export interface ChecklistRow {
  id: string;
  label: string;
  tone: "confirmed" | "open" | "proposed" | "risk" | "na";
  detail: string;
}

export type EngineResult =
  | { ok: true; order: Order; notice?: string }
  | { ok: false; order: Order; error: string };

export type ReviewEngine = "deterministic" | "bedrock" | "ai_gateway";

export interface RuntimeConfig {
  mode: AppMode;
  modeLabel: "DEMO_MODE" | "AWS_MODE";
  missing: string[];
  bedrockConfigured: boolean;
  gatewayConfigured: boolean;
  sesConfigured: boolean;
  /** True only when AWS_MODE and SES_FROM_ADDRESS + AWS_REGION are set — real SendEmail path. */
  sesLive: boolean;
  dynamoConfigured: boolean;
  s3Configured: boolean;
  inboundConfigured: boolean;
  reviewEngine: ReviewEngine;
}
