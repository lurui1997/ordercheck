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

  it("merges a buyer restatement into evidence without closing the milestone", async () => {
    const order = reviewedOrder();
    const store = new Map<string, Order>([[order.id, structuredClone(order)]]);
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
      "Date: Fri, 24 Oct 2026 13:00:00 GMT",
      "Message-ID: <Buyer-Echo@example.com>",
      "",
      "Following up: delivered to our London warehouse by 20 November 2026.",
    ].join("\n");

    const result = await handleInboundRecord(
      {
        bucket: "raw-mail",
        key: "inbound/echo",
        messageId: "buyer-echo@example.com",
        recipients: ["orders+DEMO-001@mail.example.com"],
      },
      { repository, rawMime: raw },
    );
    expect(result.status).toBe("applied");
    const saved = store.get("DEMO-001")!;
    const delivery = saved.issues.find((issue) => issue.issue_id === "delivery_milestone");
    expect(delivery?.status).toBe("unconfirmed");
    expect(delivery?.evidence.some((item) => item.message_id === "buyer-echo@example.com")).toBe(true);
    expect(delivery?.history.some((event) => event.reason.includes("SES 入站"))).toBe(true);
    expect(saved.issues.find((issue) => issue.issue_id === "sample_version")?.status).toBe("unconfirmed");
    expect(saved.messages.find((item) => item.id === "buyer-echo@example.com")?.sent_at).toBe("2026-10-24T13:00:00.000Z");
  });

  it("confirms only sample v2 when the seller inbound message accepts that version", async () => {
    const order = reviewedOrder();
    const store = new Map<string, Order>([[order.id, structuredClone(order)]]);
    const repository: OrderRepository = {
      async get(id) {
        return store.get(id) ?? null;
      },
      async save(next) {
        store.set(next.id, next);
      },
    };
    const raw = [
      "From: seller@example.com",
      "To: orders+DEMO-001@mail.example.com",
      "Subject: Re: [OrderCheck:DEMO-001]",
      "Message-ID: <seller-confirm@example.com>",
      "",
      "We confirm sample v2.",
    ].join("\n");
    const result = await handleInboundRecord(
      {
        bucket: "raw-mail",
        key: "inbound/confirm",
        messageId: "seller-confirm@example.com",
        recipients: ["orders+DEMO-001@mail.example.com"],
      },
      { repository, rawMime: raw },
    );
    expect(result.status).toBe("applied");
    const saved = store.get("DEMO-001")!;
    expect(saved.issues.find((issue) => issue.issue_id === "sample_version")).toMatchObject({ status: "confirmed" });
    expect(saved.issues.find((issue) => issue.issue_id === "delivery_milestone")?.status).toBe("unconfirmed");
    expect(saved.issues.find((issue) => issue.issue_id === "sample_version")?.history.some((event) => event.reason.includes("SES 入站"))).toBe(true);
    for (const issue of saved.issues) {
      for (const evidence of [...issue.evidence, ...issue.resolution_evidence]) {
        const message = saved.messages.find((item) => item.id === evidence.message_id);
        expect(message?.body.includes(evidence.quote)).toBe(true);
      }
    }
  });

  it("rejects an unknown sender and dedupes bracketed message ids", async () => {
    const order = reviewedOrder();
    const store = new Map<string, Order>([[order.id, structuredClone(order)]]);
    const before = store.get("DEMO-001")!.messages.length;
    const repository: OrderRepository = {
      async get(id) {
        return store.get(id) ?? null;
      },
      async save(next) {
        store.set(next.id, next);
      },
    };
    const stranger = await handleInboundRecord(
      {
        bucket: "raw-mail",
        key: "inbound/stranger",
        messageId: "stranger@example.com",
        recipients: ["orders+DEMO-001@mail.example.com"],
      },
      {
        repository,
        rawMime: "From: stranger@example.com\nSubject: [OrderCheck:DEMO-001]\nMessage-ID: <stranger@example.com>\n\nWe confirm sample v2.",
      },
    );
    expect(stranger.status).toBe("apply_failed");
    expect(store.get("DEMO-001")!.messages).toHaveLength(before);

    const raw = "From: buyer@example.com\nSubject: [OrderCheck:DEMO-001]\nMessage-ID: <Ses-In-9@example.com>\n\nWe accept sample v2.";
    const first = await handleInboundRecord(
      { bucket: "b", key: "k", messageId: "fallback-id", recipients: ["orders+DEMO-001@mail.example.com"] },
      { repository, rawMime: raw },
    );
    expect(first.status).toBe("applied");
    const second = await handleInboundRecord(
      { bucket: "b", key: "k2", messageId: "SES-IN-9@example.com", recipients: ["orders+DEMO-001@mail.example.com"] },
      { repository, rawMime: raw },
    );
    expect(second.status).toBe("duplicate");
  });

  it("returns unmatched without order association", async () => {
    const result = await handleInboundRecord(
      { bucket: "b", key: "k", messageId: "m", recipients: ["nobody@example.com"] },
      { rawMime: "From: a@b.com\nSubject: hello\n\nHi" },
    );
    expect(result.status).toBe("unmatched");
  });
});
