import raw from "@/docs/handoff/demo-scenario.json";
import type { Evidence, Message, Order, Role } from "@/lib/types";

interface ScenarioParty {
  name: string;
  email: string;
  country: string;
}

interface ScenarioMessage {
  id: string;
  source: string;
  from_role: Role;
  sent_at?: string;
  subject?: string;
  body: string;
}

interface ScenarioFile {
  note: string;
  synthetic: boolean;
  order: {
    id: string;
    name: string;
    stage: string;
    buyer: ScenarioParty;
    seller: ScenarioParty;
    reviewer: string;
  };
  initial_messages: ScenarioMessage[];
  expected_issues: Array<{
    id: string;
    kind: string;
    priority: string;
    title_zh: string;
    evidence: Evidence[];
    expected_behavior_zh: string;
  }>;
  secondary_open_items: string[];
  draft_example: {
    from_role: Role;
    to_role: Role;
    subject: string;
    body: string;
  };
  reply_sequence: ScenarioMessage[];
  ambiguous_reply_variant: ScenarioMessage & { expected_state_zh?: string };
  reopen_variant: ScenarioMessage & { expected_state_zh?: string };
  expected_final_summary: Record<string, string | number>;
}

export const scenario = raw as ScenarioFile;

function asMessage(input: ScenarioMessage, fallbackTime: string): Message {
  return {
    id: input.id,
    source: input.source === "fixture" ? "fixture" : "manual",
    from_role: input.from_role,
    sent_at: input.sent_at ?? fallbackTime,
    subject: input.subject ?? "Re: Gift packaging order - requirements",
    body: input.body,
  };
}

export function createOrderFromScenario(source: ScenarioFile = scenario): Order {
  return {
    id: source.order.id,
    name: source.order.name,
    stage: source.order.stage,
    buyer: source.order.buyer,
    seller: source.order.seller,
    reviewer: "seller",
    messages: source.initial_messages.map((message) => asMessage(message, message.sent_at ?? "2026-10-24T08:00:00Z")),
    issues: [],
    facts: [],
    outbound: [],
    reviewed: false,
  };
}

export function scriptedReplies(source: ScenarioFile = scenario): Message[] {
  return source.reply_sequence.map((message) => asMessage(message, "2026-10-24T10:00:00Z"));
}

export function ambiguousReply(source: ScenarioFile = scenario): Message {
  return asMessage(
    { ...source.ambiguous_reply_variant, sent_at: "2026-10-24T12:00:00Z", subject: "Re: Gift packaging order - requirements" },
    "2026-10-24T12:00:00Z",
  );
}

export function reopenReply(source: ScenarioFile = scenario): Message {
  return asMessage(
    { ...source.reopen_variant, sent_at: "2026-10-24T12:30:00Z", subject: "Re: Gift packaging order - requirements" },
    "2026-10-24T12:30:00Z",
  );
}
