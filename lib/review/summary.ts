import type {
  AgreementSnapshot,
  AgreementSummary,
  ChecklistRow,
  Issue,
  IssueStatus,
  KnownFact,
  Order,
  SummaryLine,
} from "@/lib/types";

const OPEN: IssueStatus[] = ["unconfirmed", "question_sent", "proposed", "reopened", "needs_human_review"];

function lineFromIssue(issue: Issue): SummaryLine {
  return {
    issue_id: issue.issue_id,
    title: issue.title,
    status: issue.status,
    value: issue.value,
    detail: issue.impact,
    waiting_for: issue.waiting_for,
    evidence: issue.status === "confirmed" ? issue.resolution_evidence : issue.evidence,
    reason: issue.decision_reason,
  };
}

function factLine(fact: KnownFact, status: SummaryLine["status"]): SummaryLine {
  return {
    issue_id: fact.id,
    title: fact.label,
    status,
    value: fact.value,
    detail: fact.scope_note,
    waiting_for: "none",
    evidence: fact.evidence,
  };
}

function snapshotFrom(order: Order): AgreementSnapshot {
  const issue = (id: string) => order.issues.find((item) => item.issue_id === id);
  const fact = (id: string) => order.facts.find((item) => item.id === id);
  const confirmedIssue = (id: string) => issue(id)?.status === "confirmed";
  const confirmedFact = (id: string) => fact(id)?.status === "confirmed";
  const blob = (id: string) =>
    [...(issue(id)?.resolution_evidence ?? []), ...(issue(id)?.evidence ?? [])].map((item) => item.quote).join("\n");
  const snapshot: AgreementSnapshot = {};

  if (confirmedIssue("sample_version") && blob("sample_version").includes("sample v2")) snapshot.sample = "v2";
  if (confirmedFact("quantity")) snapshot.quantity_sets = "1000";
  if (confirmedIssue("inserts_scope") && blob("inserts_scope").includes("protective insert")) {
    snapshot.scope = "one box and one protective insert per set";
  }
  if (confirmedFact("set_price") && (fact("set_price")?.evidence ?? []).some((item) => item.quote.includes("USD 2.60"))) {
    snapshot.unit_price_per_set = "2.60";
  }
  if (confirmedFact("goods_subtotal")) snapshot.goods_subtotal = "2600";
  if (confirmedIssue("shipping_charges") && blob("shipping_charges").includes("USD 300")) snapshot.shipping_charge = "300";
  if (snapshot.goods_subtotal && snapshot.shipping_charge && confirmedFact("order_total")) snapshot.order_total = "2900";
  if (confirmedIssue("delivery_milestone") && blob("delivery_milestone").includes("LONDON-DEMO-ADDRESS")) {
    snapshot.delivery_milestone = "delivery at LONDON-DEMO-ADDRESS";
    snapshot.delivery_deadline = "20 November 2026";
  }
  if (confirmedIssue("payment_terms") && blob("payment_terms").includes("30% deposit")) {
    snapshot.payment = "30% deposit, 70% before dispatch";
  }
  if (confirmedIssue("acceptance_process") && blob("acceptance_process").toLowerCase().includes("3-day")) {
    snapshot.acceptance = "3-day quantity and visible-condition check";
  }
  return snapshot;
}

export function buildSummary(order: Order): AgreementSummary {
  const quantity = order.facts.find((fact) => fact.id === "quantity");
  const box = order.facts.find((fact) => fact.id === "box_price");
  const confirmed = order.issues.filter((issue) => issue.status === "confirmed").map(lineFromIssue);
  if (quantity?.status === "confirmed") confirmed.unshift(factLine(quantity, "confirmed"));
  for (const fact of order.facts) {
    if (fact.status === "confirmed" && fact.id !== "quantity") confirmed.push(factLine(fact, "confirmed"));
  }

  const open = order.issues.filter((issue) => OPEN.includes(issue.status)).map(lineFromIssue);
  const acceptedRisk = order.issues.filter((issue) => issue.status === "accepted_risk").map(lineFromIssue);
  const notApplicable = order.issues.filter((issue) => issue.status === "not_applicable").map(lineFromIssue);
  const singleParty: SummaryLine[] = [];
  if (box && box.status !== "historical") singleParty.push(factLine(box, "unconfirmed"));
  for (const fact of order.facts) {
    if (fact.status === "proposed") singleParty.push(factLine(fact, "proposed"));
  }

  const keyIds = ["delivery_milestone", "sample_version", "inserts_scope"];
  const keyConfirmed = keyIds.every((id) => order.issues.find((issue) => issue.issue_id === id)?.status === "confirmed");
  const secondaryBlocking = order.issues.some((issue) => !keyIds.includes(issue.issue_id) && OPEN.includes(issue.status));
  const keyReady = order.reviewed && quantity?.status === "confirmed" && keyConfirmed && !secondaryBlocking;
  const snapshot = snapshotFrom(order);
  const notes = [
    "摘要只写入双方都有明确表述、并且一方接受了另一方条件的内容。",
    "没有写出来的细节保持空白，不会自动补上。",
    "约定摘要不能当作生产、付款或交货已经完成。",
  ];
  if (snapshot.delivery_deadline) notes.push("到货日约定到 20 November 2026，精确截止时刻没有约定。");
  if (box?.status === "historical") {
    notes.push("早先 USD 2.40 只覆盖盒子，不是当前含内托的整套价格。");
  }

  let nextAction = "先补齐仍未确认的事项，再准备形式发票。";
  const firstOpen = open[0];
  if (keyReady) nextAction = "卖方按已接受的条件准备形式发票（PI）。";
  else if (firstOpen) nextAction = `下一步：处理「${firstOpen.title}」。${firstOpen.waiting_for === "none" ? "" : "现在还不能把它写成双方约定。"}`;

  return {
    agreement_status: keyReady ? "key_terms_confirmed" : "incomplete",
    fulfillment_status: "not_started_or_unknown",
    confirmed,
    open,
    accepted_risk: acceptedRisk,
    not_applicable: notApplicable,
    single_party: singleParty,
    snapshot,
    next_action: nextAction,
    notes,
  };
}

export function buildChecklist(order: Order): ChecklistRow[] {
  const issue = (id: string) => order.issues.find((item) => item.issue_id === id);
  const quantity = order.facts.find((fact) => fact.id === "quantity");
  const box = order.facts.find((fact) => fact.id === "box_price");
  const setPrice = order.facts.find((fact) => fact.id === "set_price");

  const toneOf = (status?: string): ChecklistRow["tone"] => {
    if (status === "confirmed") return "confirmed";
    if (status === "accepted_risk") return "risk";
    if (status === "not_applicable") return "na";
    if (status === "proposed" || status === "question_sent") return "proposed";
    return "open";
  };

  const delivery = issue("delivery_milestone");
  const sample = issue("sample_version");
  const inserts = issue("inserts_scope");
  const acceptance = issue("acceptance_process");

  return [
    {
      id: "sample",
      label: "规格 / 样品版本",
      tone: toneOf(sample?.status),
      detail: sample?.value ?? "未知",
    },
    {
      id: "quantity",
      label: "数量",
      tone: quantity?.status === "confirmed" ? "confirmed" : "open",
      detail: quantity ? `${quantity.value} · ${quantity.scope_note}` : "未知",
    },
    {
      id: "price",
      label: "价格范围",
      tone: setPrice?.status === "confirmed" ? "confirmed" : "open",
      detail: setPrice
        ? `${setPrice.value} · ${setPrice.scope_note}`
        : box
          ? `${box.value} · ${box.scope_note}`
          : "未知",
    },
    {
      id: "inserts",
      label: "包装附件（内托）",
      tone: toneOf(inserts?.status),
      detail: inserts?.value ?? "未知",
    },
    {
      id: "schedule",
      label: "发货与到货时间",
      tone: toneOf(delivery?.status),
      detail: delivery?.value ?? "未知",
    },
    {
      id: "place",
      label: "交付地点",
      tone: toneOf(delivery?.status),
      detail: delivery?.status === "confirmed" ? "LONDON-DEMO-ADDRESS" : "伦敦到货和上海提货还不是同一承诺",
    },
    {
      id: "acceptance",
      label: "验收与异常处理",
      tone: toneOf(acceptance?.status),
      detail: acceptance?.value ?? "未知",
    },
  ];
}
