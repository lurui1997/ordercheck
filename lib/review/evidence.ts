import type { Evidence, KnownFact, Message } from "@/lib/types";

export interface RawModelIssue {
  issue_id: string;
  kind: "missing" | "ambiguous" | "conflict";
  priority: "high" | "low";
  title: string;
  evidence: Evidence[];
  impact: string;
  question: string;
  status:
    | "unconfirmed"
    | "question_sent"
    | "proposed"
    | "confirmed"
    | "needs_human_review"
    | "accepted_risk"
    | "reopened"
    | "not_applicable";
  waiting_for: "buyer" | "seller" | "both" | "none";
  resolution_evidence: Evidence[];
  value?: string;
}

export interface RawModelFact {
  id: string;
  label: string;
  value: string;
  scope_note?: string;
  status: "confirmed" | "stated_by_one_party" | "proposed" | "historical";
  evidence: Evidence[];
}

export interface ModelReviewPayload {
  issues: RawModelIssue[];
  facts: RawModelFact[];
}

export interface EvidenceSanitizeResult<T> {
  kept: T[];
  dropped: number;
}

function messageById(messages: Message[], id: string): Message | undefined {
  return messages.find((message) => message.id === id);
}

/** True when quote is a non-empty substring of the cited message body. */
export function quoteIsInMessage(body: string, quote: string): boolean {
  if (!quote || !quote.trim()) return false;
  return body.includes(quote);
}

export function isEvidenceValid(evidence: Evidence, messages: Message[]): boolean {
  const message = messageById(messages, evidence.message_id);
  if (!message) return false;
  if (message.source === "demo_outbound") return false;
  return quoteIsInMessage(message.body, evidence.quote);
}

export function filterValidEvidence(items: Evidence[] | undefined, messages: Message[]): Evidence[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const result: Evidence[] = [];
  for (const item of items) {
    if (!item || typeof item.message_id !== "string" || typeof item.quote !== "string") continue;
    if (!isEvidenceValid(item, messages)) continue;
    const key = `${item.message_id}:${item.quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ message_id: item.message_id, quote: item.quote });
  }
  return result;
}

/**
 * Drop issues whose evidence quotes cannot be found in the cited messages.
 * If some evidence is invalid but at least one remains, keep the issue with only valid quotes.
 * Issues that end with zero evidence are discarded (never shown with fake citations).
 */
export function sanitizeModelIssues(
  issues: RawModelIssue[] | undefined,
  messages: Message[],
): EvidenceSanitizeResult<RawModelIssue> {
  if (!Array.isArray(issues)) return { kept: [], dropped: 0 };
  const kept: RawModelIssue[] = [];
  let dropped = 0;
  for (const issue of issues) {
    if (!issue || typeof issue.issue_id !== "string") {
      dropped += 1;
      continue;
    }
    const evidence = filterValidEvidence(issue.evidence, messages);
    const resolution_evidence = filterValidEvidence(issue.resolution_evidence, messages);
    if (evidence.length === 0) {
      dropped += 1;
      continue;
    }
    kept.push({
      ...issue,
      evidence,
      resolution_evidence,
    });
  }
  return { kept, dropped };
}

export function sanitizeModelFacts(
  facts: RawModelFact[] | undefined,
  messages: Message[],
): EvidenceSanitizeResult<KnownFact> {
  if (!Array.isArray(facts)) return { kept: [], dropped: 0 };
  const kept: KnownFact[] = [];
  let dropped = 0;
  for (const fact of facts) {
    if (!fact || typeof fact.id !== "string") {
      dropped += 1;
      continue;
    }
    const evidence = filterValidEvidence(fact.evidence, messages);
    if (evidence.length === 0) {
      dropped += 1;
      continue;
    }
    kept.push({
      id: fact.id,
      label: fact.label,
      value: fact.value,
      scope_note: fact.scope_note?.trim() || "模型给出的事实；证据已通过原文子串校验。",
      status: fact.status,
      evidence,
    });
  }
  return { kept, dropped };
}
