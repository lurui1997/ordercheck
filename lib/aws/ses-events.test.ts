import { describe, expect, it } from "vitest";
import { applySesEventPayload } from "@/lib/aws/ses-events";
import type { OrderRepository } from "@/lib/aws/repository";
import { createOrderFromScenario } from "@/lib/scenario";
import type { Order } from "@/lib/types";

function orderWithSubmit(): Order {
  const order = createOrderFromScenario();
  return {
    ...order,
    reviewed: true,
    outbound: [
      {
        id: "out-1",
        to: order.buyer.email,
        from: order.seller.email,
        subject: "Confirm",
        body: "Please confirm",
        created_at: "2026-10-24T09:30:00Z",
        mode: "aws",
        delivery_status: "submit_succeeded",
        note: "Amazon SES 已接受提交（MessageId: ses-msg-99）。这不是已投递。",
        issue_ids: [],
        provider_message_id: "ses-msg-99",
      },
    ],
  };
}

describe("applySesEventPayload", () => {
  it("updates delivery_status from SNS-wrapped Delivery event only", async () => {
    const order = orderWithSubmit();
    const store = new Map<string, Order>([[order.id, order]]);
    const repository: OrderRepository = {
      async get(id) {
        return store.get(id) ?? null;
      },
      async save(next) {
        store.set(next.id, next);
      },
    };

    const sns = {
      Type: "Notification",
      Message: JSON.stringify({
        eventType: "Delivery",
        mail: { messageId: "ses-msg-99", tags: { orderId: [order.id] } },
      }),
    };

    const result = await applySesEventPayload(sns, { repository });
    expect(result.status).toBe("updated");
    expect(result.delivery_status).toBe("delivered");
    expect(store.get(order.id)!.outbound[0].delivery_status).toBe("delivered");
  });

  it("maps Bounce and ignores Send (no invented delivered)", async () => {
    const order = orderWithSubmit();
    const store = new Map<string, Order>([[order.id, order]]);
    const repository: OrderRepository = {
      async get(id) {
        return store.get(id) ?? null;
      },
      async save(next) {
        store.set(next.id, next);
      },
    };

    const bounce = await applySesEventPayload(
      { eventType: "Bounce", mail: { messageId: "ses-msg-99", tags: { orderId: [order.id] } } },
      { repository },
    );
    expect(bounce.delivery_status).toBe("bounce");

    const ignored = await applySesEventPayload(
      { eventType: "Send", mail: { messageId: "ses-msg-99", tags: { orderId: [order.id] } } },
      { repository },
    );
    expect(ignored.status).toBe("ignored");
  });
});
