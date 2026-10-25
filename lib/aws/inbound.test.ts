import { describe, expect, it } from "vitest";
import { handleInboundRecord } from "@/lib/aws/inbound";
import { extractOrderIdFromMail, parseSimpleMime } from "@/lib/aws/mime";
import type { OrderRepository } from "@/lib/aws/repository";
import { reviewOrder } from "@/lib/review/engine";
import { createOrderFromScenario } from "@/lib/scenario";
import type { Order } from "@/lib/types";

function reviewedOrder(): Order {
  const base = createOrderFromScenario();
  const result = reviewOrder(base);
  if (!result.ok) throw new Error(result.error);
  return result.order;
}

describe("mime helpers", () => {
  it("parses text/plain and extracts order id from subject and plus-address", () => {
    const raw = [
      "From: buyer@example.com",
      "To: reply+DEMO-001@inbound.example.com",
      "Subject: Re: Gift packaging [OrderCheck:DEMO-001]",
      "Message-ID: <mid-1@example.com>",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      "We accept sample v2 and London delivery.",
    ].join("\r\n");
    const parsed = parseSimpleMime(raw);
    expect(parsed.from).toBe("buyer@example.com");
    expect(parsed.body).toContain("We accept sample v2");
    expect(parsed.messageId).toBe("mid-1@example.com");
    expect(
      extractOrderIdFromMail({
        subject: parsed.subject,
        recipients: ["reply+DEMO-001@inbound.example.com"],
        to: parsed.to,
      }),
    ).toBe("DEMO-001");
  });
});

describe("handleInboundRecord", () => {
  it("applies ses_inbound reply with dedupe", async () => {
    const order = reviewedOrder();
    const store = new Map<string, Order>([[order.id, order]]);
    const repository: OrderRepository = {
      async get(id) {
        return store.get(id) ?? null;
      },
      async save(next) {
        store.set(next.id, next);
      },
    };

    const raw = [
      "From: buyer@example.com",
      "To: orders+DEMO-001@mail.example.com",
      "Subject: Re: confirm [OrderCheck:DEMO-001]",
      "Message-ID: <ses-in-1@example.com>",
      "",
      "Please deliver to our London warehouse by 20 November 2026 with sample v2 and protective inserts.",
    ].join("\n");

    const first = await handleInboundRecord(
      {
        bucket: "raw-mail",
        key: "inbound/1",
        messageId: "ses-in-1@example.com",
        recipients: ["orders+DEMO-001@mail.example.com"],
      },
      { repository, rawMime: raw },
    );
    expect(first.status).toBe("applied");
    expect(first.orderId).toBe("DEMO-001");
    const saved = store.get("DEMO-001")!;
    expect(saved.messages.some((m) => m.source === "ses_inbound" && m.id === "ses-in-1@example.com")).toBe(true);

    const dup = await handleInboundRecord(
      {
        bucket: "raw-mail",
        key: "inbound/1",
        messageId: "ses-in-1@example.com",
        recipients: ["orders+DEMO-001@mail.example.com"],
      },
      { repository, rawMime: raw },
    );
    expect(dup.status).toBe("duplicate");
  });

  it("returns unmatched without order association", async () => {
    const result = await handleInboundRecord(
      { bucket: "b", key: "k", messageId: "m", recipients: ["nobody@example.com"] },
      { rawMime: "From: a@b.com\nSubject: hello\n\nHi" },
    );
    expect(result.status).toBe("unmatched");
  });
});
