import { latestStance, stancesFromMessages } from "@/lib/review/extract";
import { buildDraft } from "@/lib/review/draft";
import { buildChecklist, buildSummary } from "@/lib/review/summary";
import type {
  DecisionKind,
  EngineResult,
  Evidence,
  Issue,
  IssueKind,
  IssueStatus,
  KnownFact,
  Message,
  Order,
  Priority,
  Stance,
  TermId,
  WaitingFor,
} from "@/lib/types";

export { buildChecklist, buildDraft, buildSummary };

const ISSUE_TERM: Record<string, TermId> = {
  delivery_milestone: "delivery",
  sample_version: "sample",
  inserts_scope: "inserts",
  shipping_charges: "shipping",
  payment_terms: "payment",
  acceptance_process: "acceptance",
};

const QUESTIONS: Record<string, string> = {
  delivery_milestone:
    "Could you confirm the delivery date at the London warehouse, rather than the collection date in Shanghai?",
  sample_version:
    "Please confirm which sample should apply. The request refers to sample v2, while quotation Q-001 lists sample v1.",
  inserts_scope:
    "Please confirm whether protective inserts are included and what the price is for a complete set.",
  shipping_charges: "Please confirm the shipping charge as its own amount. It is not included in the box price.",
  payment_terms: "Please confirm the payment terms. None are agreed yet.",
  acceptance_process:
    "Please confirm how quantity and visible condition will be checked, and how a shortage or visible damage would be handled.",
};

const TITLES: Record<string, string> = {
  delivery_milestone: "到货与提货里程碑未对齐",
  sample_version: "样品版本不一致",
  inserts_scope: "内托是否包含及费用未确认",
  shipping_charges: "运费尚未约定",
  payment_terms: "付款条件尚未约定",
  acceptance_process: "验收与异常处理尚未约定",
};

const PRIORITY: Record<string, Priority> = {
  delivery_milestone: "high",
  sample_version: "high",
  inserts_scope: "high",
  shipping_charges: "low",
  payment_terms: "low",
  acceptance_process: "low",
};

const BASE_KIND: Record<string, IssueKind> = {
  delivery_milestone: "conflict",
  sample_version: "conflict",
  inserts_scope: "missing",
  shipping_charges: "missing",
  payment_terms: "missing",
  acceptance_process: "missing",
};

interface Assessment {
  status: IssueStatus;
  waiting_for: WaitingFor;
  evidence: Evidence[];
  resolution_evidence: Evidence[];
  value?: string;
  impact: string;
  change_reason: string;
  unchanged_note?: string;
}

function fail(order: Order, error: string): EngineResult {
  return { ok: false, order, error };
}

function done(order: Order, notice?: string): EngineResult {
  return notice ? { ok: true, order, notice } : { ok: true, order };
}

function findQuote(messages: Message[], text: string): Evidence | null {
  for (const message of messages) {
    if (message.source === "demo_outbound") continue;
    if (message.body.includes(text)) return { message_id: message.id, quote: text };
  }
  return null;
}

function evidenceFromStance(item: Stance | undefined): Evidence | null {
  if (!item) return null;
  return { message_id: item.messageId, quote: item.quote };
}

function dedupe(items: Array<Evidence | null | undefined>): Evidence[] {
  const seen = new Set<string>();
  const result: Evidence[] = [];
  for (const item of items) {
    if (!item) continue;
    const key = `${item.message_id}:${item.quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function agrees(buyer: Stance | undefined, seller: Stance | undefined): boolean {
  if (!buyer || !seller) return false;
  if (buyer.pendingApproval || seller.pendingApproval) return false;
  if (buyer.value !== seller.value) return false;
  return buyer.kind === "accept" || seller.kind === "accept";
}

function hadEarlierSellerAccept(stances: Stance[], term: TermId, value: string, latest: Stance): boolean {
  return stances.some(
    (item) => item !== latest && item.term === term && item.party === "seller" && item.kind === "accept" && item.value === value,
  );
}

function assessSample(stances: Stance[], messages: Message[]): Assessment | null {
  const buyer = latestStance(stances, "sample", "buyer");
  const seller = latestStance(stances, "sample", "seller");
  if (!buyer && !seller) return null;
  const opening = dedupe([findQuote(messages, "based on sample v2"), findQuote(messages, "based on sample v1")]);
  const pair = dedupe([evidenceFromStance(buyer), evidenceFromStance(seller)]);

  if (seller?.pendingApproval) {
    const reopened = hadEarlierSellerAccept(stances, "sample", "v2", seller);
    return {
      status: reopened ? "reopened" : "unconfirmed",
      waiting_for: "buyer",
      evidence: dedupe([...opening, ...pair]),
      resolution_evidence: [],
      value: "卖方提议改用 sample v1，等待买方批准",
      impact: reopened
        ? "确认之后卖方表示 sample v2 材料不可用，提议改用 sample v1，且需要买方批准。v2 不能再当作当前无争议约定，系统也不会自动接受 v1。"
        : "卖方提议使用 sample v1，并写明需要买方批准。买方要求的 v2 还没有被卖方接受，v1 也还不是约定。",
      change_reason: reopened ? "卖方在确认后提议替换样品版本，事项重开。" : "卖方提议了另一个样品版本，仍待买方批准。",
    };
  }

  if (agrees(buyer, seller) && buyer?.value === "v2") {
    return {
      status: "confirmed",
      waiting_for: "none",
      evidence: dedupe([...opening, ...pair]),
      resolution_evidence: pair,
      value: "sample v2",
      impact: "买方要求 sample v2，卖方已明确确认 sample v2。版本约定成立。报价里出现过的 v1 不再是当前约定。",
      change_reason: "买卖双方都明确落到 sample v2，其中一方作了确认。",
    };
  }

  if (buyer?.value === "v2" && seller?.value === "v1") {
    return {
      status: "unconfirmed",
      waiting_for: "both",
      evidence: dedupe([...opening, ...pair]),
      resolution_evidence: [],
      value: "买方 sample v2 / 报价 sample v1",
      impact: "买方要求 sample v2，报价写的是 sample v1。需要确认用哪一版，不能自动采用较新的版本。",
      change_reason: "样品版本仍然互相矛盾。",
      unchanged_note: "买方再次明确 sample v2，卖方仍停留在另一版本。这不能当成双方已确认。",
    };
  }

  return {
    status: "proposed",
    waiting_for: seller?.kind === "offer" || seller?.kind === "accept" ? "buyer" : "seller",
    evidence: dedupe([...opening, ...pair]),
    resolution_evidence: [],
    value: buyer?.value === seller?.value ? `sample ${buyer?.value}` : "版本仍待对齐",
    impact: "有一方提出了样品版本，另一方还没有明确接受。单方说法不是双方约定。",
    change_reason: "样品版本有了新的单方说法，仍待另一方接受。",
  };
}

function assessDelivery(stances: Stance[], messages: Message[]): Assessment | null {
  const buyer = latestStance(stances, "delivery", "buyer");
  const seller = latestStance(stances, "delivery", "seller");
  if (!buyer && !seller) return null;
  const opening = dedupe([
    findQuote(messages, "delivered to our London warehouse by 20 November 2026"),
    findQuote(messages, "ready for collection in Shanghai on 20 November 2026"),
  ]);
  const pair = dedupe([evidenceFromStance(buyer), evidenceFromStance(seller)]);

  if (agrees(buyer, seller) && buyer?.value === "london_delivery_2026-11-20") {
    return {
      status: "confirmed",
      waiting_for: "none",
      evidence: dedupe([...opening, ...pair]),
      resolution_evidence: pair,
      value: "2026-11-20 前送达 LONDON-DEMO-ADDRESS",
      impact: "双方已明确约定 2026-11-20 前送达 LONDON-DEMO-ADDRESS。没有约定精确时刻。这不是已经发货或已经到货。",
      change_reason: "买方接受了卖方的伦敦到货承诺。",
    };
  }

  if (buyer?.value === "london_delivery_2026-11-20" && seller?.value === "london_delivery_2026-11-20") {
    return {
      status: "proposed",
      waiting_for: "buyer",
      evidence: dedupe([...opening, ...pair]),
      resolution_evidence: [],
      value: "卖方承诺伦敦到货，待买方接受",
      impact: "卖方已承诺 2026-11-20 前送达 LONDON-DEMO-ADDRESS。这仍是更新报价的一部分，买方还没有接受。不能把单方承诺写成双方约定，也不能把早先的上海提货日当成到货日。",
      change_reason: "卖方提出伦敦到货承诺，等待买方接受。",
    };
  }

  if (buyer?.value === "london_delivery_2026-11-20" && seller?.value === "shanghai_collection_2026-11-20") {
    return {
      status: "unconfirmed",
      waiting_for: "seller",
      evidence: opening.length ? opening : pair,
      resolution_evidence: [],
      value: "未对齐：伦敦到货 vs 上海提货",
      impact: "买方要求 2026-11-20 前送到伦敦仓库；卖方写的是同日在上海可以提货。相同的日期不是同一个里程碑。目前没有确认伦敦到货期限，也不能据此断言运输一定来不及。",
      change_reason: "到货和提货仍是两个里程碑。",
    };
  }

  return {
    status: "unconfirmed",
    waiting_for: "both",
    evidence: dedupe([...opening, ...pair]),
    resolution_evidence: [],
    value: "交付里程碑未确认",
    impact: "交付地点或里程碑还没有双方一致的说法。",
    change_reason: "交付里程碑仍未确认。",
  };
}

function assessInserts(stances: Stance[], messages: Message[]): Assessment | null {
  const buyer = latestStance(stances, "inserts", "buyer");
  const seller = latestStance(stances, "inserts", "seller");
  const mentioned = Boolean(findQuote(messages, "including the protective inserts") || buyer || seller);
  if (!mentioned) return null;
  const opening = dedupe([
    findQuote(messages, "including the protective inserts"),
    findQuote(messages, "The boxes are USD 2.40 each."),
  ]);
  const pair = dedupe([evidenceFromStance(buyer), evidenceFromStance(seller)]);

  if (agrees(buyer, seller) && buyer?.value === "box_plus_insert_usd_2.60") {
    return {
      status: "confirmed",
      waiting_for: "none",
      evidence: dedupe([...opening, ...pair]),
      resolution_evidence: pair,
      value: "每套 1 盒 + 1 内托，USD 2.60 / 套",
      impact: "双方已约定每套含一个盒子和一个保护内托，单价 USD 2.60。这不是早先只覆盖盒子的 USD 2.40。",
      change_reason: "买方接受了含内托的整套价格。",
    };
  }

  if (seller?.value === "box_plus_insert_usd_2.60" && buyer?.value !== "box_plus_insert_usd_2.60") {
    return {
      status: "proposed",
      waiting_for: "buyer",
      evidence: dedupe([...opening, ...pair]),
      resolution_evidence: [],
      value: "卖方提议整套 USD 2.60，待买方接受",
      impact: "卖方提出每套包含一个盒子和一个保护内托，单价 USD 2.60。买方还没有接受。不能把这个价格当成已经约定，也不能回头假设 USD 2.40 已经包含内托。",
      change_reason: "卖方提出了含内托的整套价格，等待买方接受。",
    };
  }

  return {
    status: "unconfirmed",
    waiting_for: "seller",
    evidence: opening.length ? opening : pair,
    resolution_evidence: [],
    value: "内托范围和费用都未确认",
    impact: "买方要求包含保护内托。卖方只报了盒子 USD 2.40 each，没有说明内托是否包含、是否加价。不能假设包含，也不能假设不包含。",
    change_reason: "内托范围和费用仍然没有明确回复。",
  };
}

function assessSimple(
  term: TermId,
  stances: Stance[],
  messages: Message[],
  openingQuote: string,
  labels: { missing: string; proposed: string; confirmed: string; value: string },
): Assessment | null {
  const buyer = latestStance(stances, term, "buyer");
  const seller = latestStance(stances, term, "seller");
  const opening = findQuote(messages, openingQuote);
  if (!opening && !buyer && !seller) return null;
  const pair = dedupe([evidenceFromStance(buyer), evidenceFromStance(seller)]);
  const evidence = dedupe([opening, ...pair]);

  if (agrees(buyer, seller)) {
    return {
      status: "confirmed",
      waiting_for: "none",
      evidence,
      resolution_evidence: pair,
      value: labels.value,
      impact: labels.confirmed,
      change_reason: `${labels.value} 已由双方明确接受。`,
    };
  }
  if (seller?.kind === "offer" || buyer?.kind === "offer") {
    const waitingFor = seller?.kind === "offer" ? "buyer" : "seller";
    return {
      status: "proposed",
      waiting_for: waitingFor,
      evidence,
      resolution_evidence: [],
      value: `待对方接受：${labels.value}`,
      impact: labels.proposed,
      change_reason: "一方提出了条件，另一方还没有接受。",
    };
  }
  return {
    status: "unconfirmed",
    waiting_for: "both",
    evidence,
    resolution_evidence: [],
    value: "尚未约定",
    impact: labels.missing,
    change_reason: "这一项还没有具体条件。",
  };
}

function toIssue(id: string, assessment: Assessment, updatedAt: string): Issue {
  return {
    issue_id: id,
    kind: BASE_KIND[id],
    priority: PRIORITY[id],
    title: TITLES[id],
    evidence: assessment.evidence,
    impact: assessment.impact,
    question: QUESTIONS[id],
    status: assessment.status,
    waiting_for: assessment.waiting_for,
    resolution_evidence: assessment.resolution_evidence,
    history: [],
    updated_at: updatedAt,
    value: assessment.value,
  };
}

function deriveIssues(messages: Message[], stances: Stance[], updatedAt: string): { issues: Issue[]; notes: Record<string, string | undefined>; reasons: Record<string, string> } {
  const sample = assessSample(stances, messages);
  const delivery = assessDelivery(stances, messages);
  const inserts = assessInserts(stances, messages);
  const shipping = assessSimple("shipping", stances, messages, "Shipping charges", {
    missing: "报价写明运费另议，目前没有金额。",
    proposed: "卖方提出另加运费 USD 300。买方还没有接受，不能写成已约定运费。",
    confirmed: "双方已约定运费 USD 300，与货值分开。",
    value: "USD 300",
  });
  const payment = assessSimple("payment", stances, messages, "payment terms", {
    missing: "付款条件写明另议，目前没有比例或账期。",
    proposed: "卖方提出 30% 定金、发货前 70%。买方还没有接受。",
    confirmed: "双方已约定 30% 定金，发货前支付 70%。",
    value: "30% 定金，发货前 70%",
  });
  const acceptance = assessSimple("acceptance", stances, messages, "the acceptance process", {
    missing: "验收和异常处理写明另议，目前没有检查期限或补救方式。",
    proposed: "卖方提出收货后 3 日内核对数量和外观，并用照片通知。买方还没有接受。补救方式仍要再约定，不能写成已经保证退换。",
    confirmed: "双方已约定收货后 3 日内核对数量和外观，并用照片通知。短缺或可见损坏的补救还要再商定，不是已经完成验收。",
    value: "收货后 3 日内核对数量和外观",
  });

  const entries: Array<[string, Assessment | null]> = [
    ["delivery_milestone", delivery],
    ["sample_version", sample],
    ["inserts_scope", inserts],
    ["shipping_charges", shipping],
    ["payment_terms", payment],
    ["acceptance_process", acceptance],
  ];

  const issues: Issue[] = [];
  const notes: Record<string, string | undefined> = {};
  const reasons: Record<string, string> = {};
  for (const [id, assessment] of entries) {
    if (!assessment) continue;
    if (assessment.evidence.length === 0) continue;
    issues.push(toIssue(id, assessment, updatedAt));
    notes[id] = assessment.unchanged_note;
    reasons[id] = assessment.change_reason;
  }
  return { issues, notes, reasons };
}

function quoteFact(messages: Message[], text: string): Evidence[] {
  const found = findQuote(messages, text);
  return found ? [found] : [];
}

function deriveFacts(messages: Message[], stances: Stance[], issues: Issue[]): KnownFact[] {
  const facts: KnownFact[] = [];
  const buyerQty = latestStance(stances, "quantity", "buyer");
  const sellerQty = latestStance(stances, "quantity", "seller");
  if (buyerQty && sellerQty && agrees(buyerQty, sellerQty)) {
    facts.push({
      id: "quantity",
      label: "数量",
      value: "1,000 套",
      scope_note: "买方提出 1,000 套，卖方明确确认了同一数量。不再追问数量。",
      status: "confirmed",
      evidence: dedupe([evidenceFromStance(buyerQty), evidenceFromStance(sellerQty)]),
    });
  }

  const inserts = issues.find((issue) => issue.issue_id === "inserts_scope");
  const boxEvidence = dedupe([
    ...quoteFact(messages, "The boxes are USD 2.40 each."),
    ...quoteFact(messages, "USD 2.40 per box"),
  ]);
  if (boxEvidence.length) {
    facts.push({
      id: "box_price",
      label: "盒子单价",
      value: "USD 2.40 / 盒",
      scope_note:
        inserts?.status === "confirmed"
          ? "这是较早的盒子单价，只覆盖盒子，已被后续整套价格取代。"
          : "只覆盖盒子，不是含内托的整套价格。买方还没有把这个单价确认为整套价格。",
      status: inserts?.status === "confirmed" ? "historical" : "stated_by_one_party",
      evidence: boxEvidence,
    });
  }

  const setEvidence = dedupe([
    ...quoteFact(messages, "each including one box and one protective insert, at USD 2.60 per set"),
    ...quoteFact(messages, "1,000 sets with protective inserts at USD 2.60 per set"),
  ]);
  if (inserts && (inserts.status === "proposed" || inserts.status === "confirmed") && setEvidence.length) {
    facts.push({
      id: "set_price",
      label: "整套单价",
      value: "USD 2.60 / 套",
      scope_note: "每套包含一个盒子和一个保护内托。",
      status: inserts.status === "confirmed" ? "confirmed" : "proposed",
      evidence: setEvidence,
    });
  }

  const subtotalEvidence = quoteFact(messages, "goods subtotal USD 2,600");
  const subtotalBuyer = latestStance(stances, "goods_subtotal", "buyer");
  const subtotalSeller = latestStance(stances, "goods_subtotal", "seller");
  if (subtotalEvidence.length && subtotalBuyer && subtotalSeller) {
    facts.push({
      id: "goods_subtotal",
      label: "货值小计",
      value: "USD 2,600",
      scope_note: "对应 1,000 套、每套 USD 2.60，不含运费。",
      status: agrees(subtotalBuyer, subtotalSeller) ? "confirmed" : "proposed",
      evidence: dedupe([evidenceFromStance(subtotalSeller), evidenceFromStance(subtotalBuyer)]),
    });
  }

  const totalBuyer = latestStance(stances, "order_total", "buyer");
  const totalSeller = latestStance(stances, "order_total", "seller");
  if (totalBuyer && totalSeller) {
    facts.push({
      id: "order_total",
      label: "订单总额",
      value: "USD 2,900",
      scope_note: "货值 USD 2,600 加运费 USD 300。只在双方都接受后成立。",
      status: agrees(totalBuyer, totalSeller) ? "confirmed" : "proposed",
      evidence: dedupe([evidenceFromStance(totalSeller), evidenceFromStance(totalBuyer)]),
    });
  }

  return facts.filter((fact) => fact.evidence.length > 0);
}

const HOLD: IssueStatus[] = ["accepted_risk", "needs_human_review", "not_applicable"];

function mergeStatus(previous: IssueStatus | undefined, computed: IssueStatus): IssueStatus {
  if (!previous) return computed;
  if (previous === "not_applicable") return "not_applicable";
  if (previous === "accepted_risk") {
    if (computed === "confirmed" || computed === "reopened") return computed;
    return "accepted_risk";
  }
  if (previous === "needs_human_review") {
    if (computed === "confirmed" || computed === "reopened") return computed;
    return "needs_human_review";
  }
  if (previous === "question_sent" && computed === "unconfirmed") return "question_sent";
  return computed;
}

function withInboundNote(reason: string, trigger?: Message): string {
  if (trigger?.source !== "ses_inbound") return reason;
  return `${reason} 触发消息来自 SES 入站。`;
}

/** Attach the triggering message when it repeats an existing grounded quote. Does not change status. */
function mergeTriggerEvidence(issue: Issue, trigger?: Message): Issue {
  if (!trigger || trigger.source === "demo_outbound") return issue;
  const extras: Evidence[] = [];
  for (const item of issue.evidence) {
    if (item.message_id === trigger.id) continue;
    if (item.quote.length < 8) continue;
    if (!trigger.body.includes(item.quote)) continue;
    extras.push({ message_id: trigger.id, quote: item.quote });
  }
  if (extras.length === 0) return issue;
  return { ...issue, evidence: dedupe([...issue.evidence, ...extras]) };
}

function recompute(order: Order, trigger?: Message): Order {
  const analyzable = order.messages.filter((message) => message.source !== "demo_outbound");
  const updatedAt = trigger?.sent_at ?? analyzable.at(-1)?.sent_at ?? "2026-10-24T09:01:00Z";
  const stances = stancesFromMessages(order.messages);
  const derived = deriveIssues(order.messages, stances, updatedAt);
  const previous = new Map(order.issues.map((issue) => [issue.issue_id, issue]));
  const triggerTerms = new Set((trigger ? stancesFromMessages([trigger]) : []).map((item) => item.term));

  const issues = derived.issues.map((issue) => {
    const prev = previous.get(issue.issue_id);
    const status = mergeStatus(prev?.status, issue.status);
    if (!prev) {
      return mergeTriggerEvidence(
        {
          ...issue,
          history: [
            {
              at: updatedAt,
              from: null,
              to: issue.status,
              actor: "system",
              reason: withInboundNote("初次核对。缺少的信息保持未知，没有补写。", trigger),
            },
          ],
        },
        trigger,
      );
    }

    if (HOLD.includes(prev.status) && status === prev.status) return prev;

    const term = ISSUE_TERM[issue.issue_id];
    const touched = trigger ? triggerTerms.has(term) : false;
    const history = [...prev.history];
    let decisionReason = prev.decision_reason;
    let decisionActor = prev.decision_actor;
    if (status !== prev.status) {
      if (status === "confirmed" || status === "reopened") {
        decisionReason = undefined;
        decisionActor = undefined;
      }
      history.push({
        at: trigger?.sent_at ?? updatedAt,
        from: prev.status,
        to: status,
        message_id: trigger?.id,
        actor: "system",
        reason: withInboundNote(derived.reasons[issue.issue_id] ?? issue.impact, trigger),
      });
    } else if (touched && status === prev.status && derived.notes[issue.issue_id] && (status === "unconfirmed" || status === "question_sent")) {
      history.push({
        at: trigger?.sent_at ?? updatedAt,
        from: status,
        to: status,
        message_id: trigger?.id,
        actor: "system",
        reason: withInboundNote(derived.notes[issue.issue_id] ?? "", trigger),
      });
    } else if (
      trigger?.source === "ses_inbound" &&
      issue.evidence.some((item) => item.quote.length >= 8 && trigger.body.includes(item.quote))
    ) {
      history.push({
        at: trigger.sent_at,
        from: status,
        to: status,
        message_id: trigger.id,
        actor: "system",
        reason: "SES 入站复述了已有引用，证据已并入；状态未因复述而关闭。",
      });
    }

    return mergeTriggerEvidence(
      {
        ...issue,
        status,
        history,
        decision_reason: decisionReason,
        decision_actor: decisionActor,
        updated_at: touched || status !== prev.status ? (trigger?.sent_at ?? updatedAt) : prev.updated_at,
      },
      trigger,
    );
  });

  return {
    ...order,
    reviewed: true,
    reviewed_at: order.reviewed_at ?? updatedAt,
    issues,
    facts: deriveFacts(order.messages, stances, issues),
  };
}

export function reviewOrder(order: Order): EngineResult {
  const analyzable = order.messages.filter((message) => message.source !== "demo_outbound");
  if (analyzable.length === 0) return fail(order, "还没有可核对的邮件或报价。");
  return done(recompute(order));
}

export function applyReply(
  order: Order,
  message: Message,
  options?: { allowSesInbound?: boolean; allowEmailInbound?: boolean },
): EngineResult {
  if (!order.reviewed) return fail(order, "请先开始核对，再录入回复。");
  if (!message.body.trim()) return fail(order, "回复正文是空的。");
  if (message.source === "ses_inbound" && !options?.allowSesInbound) {
    return fail(order, "页面不能把内容标成 SES 收件。入站邮件只能由 AWS 收件事件写入。");
  }
  if (message.source === "email_inbound" && !options?.allowEmailInbound) {
    return fail(order, "页面不能把内容标成邮件入站。入站邮件只能由入站接口写入。");
  }
  const allowed =
    message.source === "fixture" ||
    message.source === "manual" ||
    (message.source === "ses_inbound" && options?.allowSesInbound) ||
    (message.source === "email_inbound" && options?.allowEmailInbound);
  if (!allowed) {
    return fail(order, "这条回复的来源标签不受支持。");
  }
  if (order.messages.some((item) => item.id === message.id)) {
    return fail(order, "这条消息已经入账，不会重复创建问题或再次发信。");
  }
  const next = { ...order, messages: [...order.messages, message] };
  const notice =
    message.source === "ses_inbound"
      ? "已按 SES 入站邮件更新相关事项。"
      : message.source === "email_inbound"
        ? "已按入站邮件更新相关事项。这不是 SES 收件。"
        : message.source === "fixture"
          ? "已按样例回放更新相关事项，这不是 SES 收件。"
          : "已按手工录入更新相关事项，这不是 SES 收件。";
  return done(recompute(next, message), notice);
}

export function applyDecision(
  order: Order,
  issueId: string,
  decision: DecisionKind,
  reason: string,
  options?: { actor?: string; at?: string },
): EngineResult {
  const issue = order.issues.find((item) => item.issue_id === issueId);
  if (!issue) return fail(order, "没有找到这个事项。");
  if (!reason.trim()) return fail(order, "请写明理由。空理由不会改变状态。");
  const allowed: IssueStatus[] = ["unconfirmed", "question_sent", "proposed", "reopened", "needs_human_review"];
  if (!allowed.includes(issue.status) || issue.status === "confirmed") {
    return fail(order, "已确认事项来自双方表述，不能改成接受风险或不适用。");
  }
  if (decision === "accepted_risk" && !["unconfirmed", "question_sent", "proposed", "reopened"].includes(issue.status)) {
    return fail(order, "只有尚未确认的事项可以标记为接受风险。");
  }
  const at = options?.at ?? order.messages.at(-1)?.sent_at ?? issue.updated_at;
  const actor = options?.actor ?? order.seller.name;
  const issues = order.issues.map((item) => {
    if (item.issue_id !== issueId) return item;
    return {
      ...item,
      status: decision,
      waiting_for: "none" as const,
      decision_reason: reason.trim(),
      decision_actor: actor,
      updated_at: at,
      history: [
        ...item.history,
        {
          at,
          from: item.status,
          to: decision,
          actor,
          reason: reason.trim(),
        },
      ],
    };
  });
  return done({ ...order, issues });
}

export function recordOutbound(
  order: Order,
  input: {
    to: string;
    subject: string;
    body: string;
    issueIds: string[];
    sent_at?: string;
    /** When a transport accepted the message — never invent delivered. */
    submit?: { messageId: string; from?: string; provider?: "ses" | "smtp" };
  },
): EngineResult {
  if (!order.reviewed) return fail(order, "请先开始核对，再记录确认邮件。");
  if (!input.to.trim() || !input.subject.trim() || !input.body.trim()) {
    return fail(order, "收件人、主题和正文都不能为空。");
  }
  if (input.issueIds.length === 0) return fail(order, "请选择至少一项要询问的事项。");
  const known = new Set(order.issues.map((issue) => issue.issue_id));
  if (input.issueIds.some((id) => !known.has(id))) return fail(order, "有事项不在当前订单里。");
  const selected = order.issues.filter((issue) => input.issueIds.includes(issue.issue_id));
  const alreadyAsked = selected.length > 0 && selected.every((issue) => issue.status === "question_sent");
  if (alreadyAsked) return fail(order, "这些事项已经记过询问。没有新的回复前，不会再次记录发送。");
  const askable = selected.filter((issue) => issue.status === "unconfirmed" || issue.status === "reopened");
  if (askable.length === 0 && selected.every((issue) => issue.status === "confirmed" || issue.status === "accepted_risk" || issue.status === "not_applicable")) {
    return fail(order, "所选事项都已经关闭，不必再问。");
  }

  const createdAt = input.sent_at ?? order.reviewed_at ?? order.messages.at(-1)?.sent_at ?? "2026-10-24T09:30:00Z";
  const serial = order.outbound.length + 1;
  const provider = input.submit?.messageId ? (input.submit.provider ?? "ses") : undefined;
  const submitted = Boolean(provider);
  const messageId = submitted ? input.submit!.messageId : `demo-out-${serial}`;
  const fromAddress = input.submit?.from?.trim() || order.seller.email;
  const historyReason =
    provider === "smtp"
      ? "卖方确认并通过 SMTP 提交发送。状态是提交成功，不是已投递。"
      : provider === "ses"
        ? "卖方确认并通过 Amazon SES 提交发送。状态是提交成功，不是已投递。"
        : "卖方确认记录这封询问。样例模式没有调用 SMTP，也没有调用 SES，不能视为已提交或已投递。";
  const issues = order.issues.map((issue) => {
    if (!input.issueIds.includes(issue.issue_id)) return issue;
    if (issue.status !== "unconfirmed" && issue.status !== "reopened") return issue;
    return {
      ...issue,
      status: "question_sent" as const,
      updated_at: createdAt,
      history: [
        ...issue.history,
        {
          at: createdAt,
          from: issue.status,
          to: "question_sent" as const,
          message_id: messageId,
          actor: order.seller.name,
          reason: historyReason,
        },
      ],
    };
  });

  return done({
    ...order,
    issues,
    outbound: [
      ...order.outbound,
      {
        id: `out-${serial}`,
        to: input.to.trim(),
        from: fromAddress,
        subject: input.subject.trim(),
        body: input.body,
        created_at: createdAt,
        mode: provider === "ses" ? "aws" : "demo",
        delivery_status: submitted ? "submit_succeeded" : "recorded_not_sent",
        note:
          provider === "smtp"
            ? `SMTP 已接受提交（MessageId: ${messageId}）。这不是已投递。`
            : provider === "ses"
              ? `Amazon SES 已接受提交（MessageId: ${messageId}）。这不是已投递。`
              : "样例模式只记录外发，没有调用 SMTP，也没有调用 Amazon SES，不能视为已提交或已投递。",
        issue_ids: input.issueIds,
        provider_message_id: submitted ? messageId : undefined,
        transport: provider,
      },
    ],
    messages: [
      ...order.messages,
      {
        id: messageId,
        source: "demo_outbound",
        from_role: "seller",
        sent_at: createdAt,
        subject: input.subject.trim(),
        body: input.body,
      },
    ],
  });
}

export function issueById(order: Order, issueId: string): Issue | undefined {
  return order.issues.find((issue) => issue.issue_id === issueId);
}
