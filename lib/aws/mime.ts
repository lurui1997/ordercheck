export interface ParsedMime {
  from: string;
  to: string[];
  subject: string;
  body: string;
  messageId: string;
  replyTo: string;
}

function decodeHeaderValue(value: string): string {
  return value.replace(/\r?\n[ \t]+/g, " ").trim();
}

function headerMap(headerBlock: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = headerBlock.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let current = "";
  for (const line of lines) {
    if (/^[ \t]/.test(line) && current) {
      current += " " + line.trim();
      continue;
    }
    if (current) {
      const idx = current.indexOf(":");
      if (idx > 0) {
        map.set(current.slice(0, idx).trim().toLowerCase(), decodeHeaderValue(current.slice(idx + 1)));
      }
    }
    current = line;
  }
  if (current) {
    const idx = current.indexOf(":");
    if (idx > 0) {
      map.set(current.slice(0, idx).trim().toLowerCase(), decodeHeaderValue(current.slice(idx + 1)));
    }
  }
  return map;
}

function splitAddresses(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => {
      const match = part.match(/<([^>]+)>/);
      return (match ? match[1] : part).trim().toLowerCase();
    })
    .filter(Boolean);
}

function extractTextPlain(rawBody: string, contentType: string): string {
  const ct = contentType.toLowerCase();
  if (!ct.includes("multipart/")) {
    return rawBody.trim();
  }
  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
  if (!boundaryMatch) return rawBody.trim();
  const boundary = boundaryMatch[1];
  const parts = rawBody.split(`--${boundary}`);
  for (const part of parts) {
    if (part.trim() === "--" || !part.trim()) continue;
    const split = part.replace(/^\r?\n/, "").split(/\r?\n\r?\n/);
    if (split.length < 2) continue;
    const partHeaders = headerMap(split[0] ?? "");
    const partType = (partHeaders.get("content-type") ?? "").toLowerCase();
    if (partType.includes("text/plain")) {
      return split.slice(1).join("\n\n").replace(/--\s*$/, "").trim();
    }
  }
  // Fall back to first non-empty body-ish chunk.
  for (const part of parts) {
    const split = part.replace(/^\r?\n/, "").split(/\r?\n\r?\n/);
    if (split.length >= 2 && split[1]?.trim()) return split[1].trim();
  }
  return rawBody.trim();
}

/**
 * Minimal MIME parser for SES→S3 raw messages: headers + text/plain body.
 * Enough for inbound association and applyReply; not a full mail library.
 */
export function parseSimpleMime(raw: string): ParsedMime {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const sep = normalized.indexOf("\n\n");
  const headerBlock = sep >= 0 ? normalized.slice(0, sep) : normalized;
  const bodyBlock = sep >= 0 ? normalized.slice(sep + 2) : "";
  const headers = headerMap(headerBlock);
  const contentType = headers.get("content-type") ?? "text/plain";
  const messageId = (headers.get("message-id") ?? "").replace(/^<|>$/g, "").trim();
  return {
    from: splitAddresses(headers.get("from"))[0] ?? "",
    to: splitAddresses(headers.get("to")),
    subject: headers.get("subject") ?? "",
    body: extractTextPlain(bodyBlock, contentType),
    messageId,
    replyTo: splitAddresses(headers.get("reply-to"))[0] ?? "",
  };
}

/** Extract order id from plus-address local part or [OrderCheck:ID] subject tag. */
export function extractOrderIdFromMail(input: {
  subject: string;
  recipients: string[];
  to?: string[];
  replyTo?: string;
}): string | null {
  const subjectMatch = input.subject.match(/\[OrderCheck:([A-Za-z0-9._-]+)\]/i);
  if (subjectMatch?.[1]) return subjectMatch[1];

  const addresses = [
    ...input.recipients,
    ...(input.to ?? []),
    ...(input.replyTo ? [input.replyTo] : []),
  ];
  for (const address of addresses) {
    const local = address.split("@")[0] ?? "";
    const plus = local.match(/\+([A-Za-z0-9._-]+)$/);
    if (plus?.[1]) return plus[1];
  }
  return null;
}
