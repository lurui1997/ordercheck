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
  /** Token counts from DeepSeek. Never copy these into gatewayUsage or a Bedrock request id. */
  deepseekUsage?: {
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

export type ReviewEngine = "deterministic" | "bedrock" | "ai_gateway" | "deepseek";

export type ReviewEngineSelection = "explicit" | "auto";

export type PersistenceKind = "memory" | "dynamodb";

export interface RuntimeConfig {
  mode: AppMode;
  modeLabel: "DEMO_MODE" | "AWS_MODE";
  missing: string[];
  bedrockConfigured: boolean;
  gatewayConfigured: boolean;
  /** True only when DEEPSEEK_API_KEY is set. Not proof a call succeeded. */
  deepseekConfigured: boolean;
  sesConfigured: boolean;
  /** True only when AWS_MODE and SES_FROM_ADDRESS + AWS_REGION are set — real SendEmail path. */
  sesLive: boolean;
  /**
   * True only when the process will use DynamoDB: table name, region, and
   * visible AWS credentials. A table name alone stays false and uses memory.
   */
  dynamoConfigured: boolean;
  /** Which order store `createOrderRepository()` will actually construct. */
  persistence: PersistenceKind;
  s3Configured: boolean;
  inboundConfigured: boolean;
  reviewEngine: ReviewEngine;
  /** `explicit` when REVIEW_ENGINE names an engine; `auto` when unset or `auto`. */
  reviewEngineSelection: ReviewEngineSelection;
  /**
   * Live engine available for compare / preference: gateway if configured,
   * else bedrock if region + model id are set, else null.
   * Independent of an explicit deterministic override.
   */
  liveEngine: ReviewEngine | null;
}

export interface CompareIssueView {
  issue_id: string;
  title: string;
  status: IssueStatus;
  kind: IssueKind;
  priority: Priority;
}

export interface CompareSide {
  /** False when no gateway key and no Bedrock region/model — the call was not attempted. */
  available: boolean;
  /** True only after a live call returned or threw. False when unavailable. */
  ran: boolean;
  engine: ReviewEngine | null;
  ok: boolean;
  issues: CompareIssueView[];
  notice?: string;
  error?: string;
  code?: string;
  /** Env names still required. Never values. */
  missing?: string[];
}

export interface ReviewAgreement {
  /** False when the live side did not succeed — do not treat empty issues as disagreement. */
  comparable: boolean;
  shared: string[];
  onlyDeterministic: string[];
  onlyLive: string[];
  statusMismatches: Array<{ issue_id: string; deterministic: IssueStatus; live: IssueStatus }>;
  /** Issue-id Jaccard, or null when not comparable. */
  jaccard: number | null;
}

export interface ReviewCompareResult {
  deterministic: CompareSide;
  live: CompareSide;
  agreement: ReviewAgreement;
}
