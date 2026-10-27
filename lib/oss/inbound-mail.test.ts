import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OrderRepository } from "@/lib/aws/repository";
import { handleGenericInbound } from "@/lib/oss/inbound-mail";
import { createDiskObjectStore } from "@/lib/oss/object-store";
import { reviewOrder } from "@/lib/review/engine";
import { createOrderFromScenario } from "@/lib/scenario";
import type { Order } from "@/lib/types";

function reviewedOrder(): Order {
  const result = reviewOrder(createOrderFromScenario());
  if (!result.ok) throw new Error(result.error);
  return result.order;
}

function memoryRepo(order: Order): { repository: OrderRepository; store: Map<string, Order> } {
  const store = new Map<string, Order>([[order.id, order]]);
  return {
    store,
    repository: {
      async get(id) {
        return store.get(id) ?? null;
      },
      async save(next) {
        store.set(next.id, next);
      },
    },
  };
}

describe("generic inbound email", () => {
  it("applies raw MIME as email_inbound and stores it on disk", async () => {
    const order = reviewedOrder();
    const { repository, store } = memoryRepo(order);
    const dir = await mkdtemp(path.join(tmpdir(), "ordercheck-inbound-"));
    const raw = [
      "From: buyer@example.com",
      "To: reply+DEMO-001@mail.example.com",
      "Subject: Re: Gift packaging [OrderCheck:DEMO-001]",
      "Message-ID: <oss-in-1@example.com>",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      "We confirm sample v2.",
    ].join("\r\n");

    const result = await handleGenericInbound(
      { raw },
      { repository, objectStore: createDiskObjectStore(dir) },
    );
    expect(result.status).toBe("applied");
    expect(result.orderId).toBe("DEMO-001");
    const saved = store.get("DEMO-001");
    const message = saved?.messages.find((item) => item.id === "oss-in-1@example.com");
    expect(message?.source).toBe("email_inbound");
    expect(message?.body).toContain("sample v2");
    const stored = await readFile(path.join(dir, result.storageKey ?? ""), "utf8");
    expect(stored).toContain("We confirm sample v2.");
  });

  it("accepts parsed text without labeling it as SES", async () => {
    const order = reviewedOrder();
    const { repository, store } = memoryRepo(order);
    const result = await handleGenericInbound(
      {
        text: "We confirm sample v2.",
        subject: "Re: [OrderCheck:DEMO-001]",
        from: "buyer@example.com",
        to: "seller@example.com",
        messageId: "parsed-1@example.com",
      },
      { repository, objectStore: null },
    );
    expect(result.status).toBe("applied");
    expect(store.get("DEMO-001")?.messages.some((item) => item.source === "email_inbound")).toBe(true);
    expect(store.get("DEMO-001")?.messages.some((item) => item.source === "ses_inbound")).toBe(false);
  });

  it("does not invent a message id", async () => {
    const order = reviewedOrder();
    const { repository } = memoryRepo(order);
    const result = await handleGenericInbound(
      { text: "Hello", subject: "[OrderCheck:DEMO-001]", from: "buyer@example.com", orderId: "DEMO-001" },
      { repository, objectStore: null },
    );
    expect(result.status).toBe("apply_failed");
    expect(result.error).toMatch(/Message-ID/);
  });

  it("does not apply the message when storage fails", async () => {
    const order = reviewedOrder();
    const { repository, store } = memoryRepo(order);
    const before = store.get("DEMO-001")?.messages.length;
    const result = await handleGenericInbound(
      {
        raw: "From: buyer@example.com\r\nSubject: [OrderCheck:DEMO-001]\r\nMessage-ID: <x@y>\r\n\r\nHi",
      },
      {
        repository,
        objectStore: {
          kind: "disk",
          async put() {
            throw new Error("disk full");
          },
          async get() {
            return "";
          },
        },
      },
    );
    expect(result.status).toBe("storage_error");
    expect(store.get("DEMO-001")?.messages.length).toBe(before);
  });
});
