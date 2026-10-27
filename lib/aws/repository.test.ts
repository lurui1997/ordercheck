import { describe, expect, it, vi } from "vitest";
import { DynamoOrderRepository, MemoryOrderRepository, selectOrderRepositoryKind } from "@/lib/aws/repository";
import { createOrderFromScenario } from "@/lib/scenario";

describe("DynamoOrderRepository", () => {
  it("gets and saves full order JSON with pk=orderId via document client", async () => {
    const order = createOrderFromScenario();
    const send = vi.fn();
    send.mockResolvedValueOnce({ Item: { pk: order.id, order } });
    send.mockResolvedValueOnce({});

    const client = { send } as never;
    const repo = new DynamoOrderRepository({ tableName: "Orders", client });

    const loaded = await repo.get(order.id);
    expect(loaded?.id).toBe(order.id);
    expect(send).toHaveBeenCalledTimes(1);
    const getInput = send.mock.calls[0][0].input;
    expect(getInput.TableName).toBe("Orders");
    expect(getInput.Key).toEqual({ pk: order.id });

    await repo.save(order);
    expect(send).toHaveBeenCalledTimes(2);
    const putInput = send.mock.calls[1][0].input;
    expect(putInput.TableName).toBe("Orders");
    expect(putInput.Item.pk).toBe(order.id);
    expect(putInput.Item.order.id).toBe(order.id);
  });

  it("returns null when item missing", async () => {
    const send = vi.fn().mockResolvedValue({ Item: undefined });
    const repo = new DynamoOrderRepository({ tableName: "Orders", client: { send } as never });
    expect(await repo.get("missing")).toBeNull();
  });
});

describe("selectOrderRepositoryKind", () => {
  it("uses Dynamo only when table, region, and credentials are all set", () => {
    expect(selectOrderRepositoryKind({ ORDERS_TABLE_NAME: "orders", AWS_REGION: "us-east-1" })).toBe("memory");
    expect(selectOrderRepositoryKind({})).toBe("memory");
    expect(
      selectOrderRepositoryKind({
        ORDERS_TABLE_NAME: "orders",
        AWS_REGION: "us-east-1",
        AWS_ACCESS_KEY_ID: "AKIA_TEST",
        AWS_SECRET_ACCESS_KEY: "secret",
      }),
    ).toBe("dynamodb");
  });
});

describe("MemoryOrderRepository", () => {
  it("round-trips an order", async () => {
    const repo = new MemoryOrderRepository();
    const order = createOrderFromScenario();
    await repo.save(order);
    expect((await repo.get(order.id))?.id).toBe(order.id);
  });
});
