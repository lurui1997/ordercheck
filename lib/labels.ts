import type { IssueKind, IssueStatus, MessageSource, Priority, WaitingFor } from "@/lib/types";

export const STATUS_LABEL: Record<IssueStatus, string> = {
  unconfirmed: "未确认",
  question_sent: "已提问",
  proposed: "待对方接受",
  confirmed: "已确认",
  needs_human_review: "需人工核实",
  accepted_risk: "已接受风险",
  reopened: "已重开",
  not_applicable: "本次不适用",
};

export const KIND_LABEL: Record<IssueKind, string> = {
  conflict: "不一致",
  missing: "缺失",
  ambiguous: "含糊",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: "重要",
  low: "次要",
};

export const WAITING_LABEL: Record<WaitingFor, string> = {
  buyer: "待买方",
  seller: "待卖方",
  both: "待双方对齐",
  none: "无需等待",
};

export const SOURCE_LABEL: Record<MessageSource, string> = {
  fixture: "样例",
  manual: "手工录入",
  ses_inbound: "SES 收件",
  email_inbound: "邮件入站",
  demo_outbound: "样例外发记录",
};

export const STAGE_LABEL: Record<string, string> = {
  before_order_confirmation: "确认订单前",
};

export function roleLabel(role: "buyer" | "seller"): string {
  return role === "buyer" ? "买方" : "卖方";
}
