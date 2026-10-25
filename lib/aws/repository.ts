import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getRuntimeConfig } from "@/lib/aws/config";
import { getOrder, saveOrder } from "@/lib/store";
import type { Order } from "@/lib/types";

export interface OrderRepository {
  get(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}

export class MemoryOrderRepository implements OrderRepository {
  async get(id: string): Promise<Order | null> {
    return getOrder(id);
  }

  async save(order: Order): Promise<void> {
    saveOrder(order);
  }
}

export interface DynamoOrderRepositoryOptions {
  tableName?: string;
  region?: string;
  /** Injected for unit tests — never invents success without a real/mock client. */
  client?: DynamoDBDocumentClient;
}

/**
 * Single-table order store: pk = orderId, attribute `order` holds the full Order JSON.
 * Selected only when ORDERS_TABLE_NAME is set; failures surface — no silent Memory fallback.
 */
export class DynamoOrderRepository implements OrderRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(options: DynamoOrderRepositoryOptions = {}) {
    const tableName = options.tableName ?? process.env.ORDERS_TABLE_NAME ?? "";
    if (!tableName) {
      throw new Error("DynamoOrderRepository 需要 ORDERS_TABLE_NAME。");
    }
    this.tableName = tableName;
    if (options.client) {
      this.client = options.client;
    } else {
      const region = options.region ?? process.env.AWS_REGION;
      if (!region) {
        throw new Error("DynamoOrderRepository 需要 AWS_REGION。");
      }
      this.client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
        marshallOptions: { removeUndefinedValues: true },
      });
    }
  }

  async get(id: string): Promise<Order | null> {
    const response = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: id },
      }),
    );
    const item = response.Item;
    if (!item || !item.order) return null;
    return item.order as Order;
  }

  async save(order: Order): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: order.id,
          order,
          updated_at: new Date().toISOString(),
        },
      }),
    );
  }
}

export function createOrderRepository(): OrderRepository {
  const config = getRuntimeConfig();
  if (config.mode === "aws" && config.dynamoConfigured) {
    return new DynamoOrderRepository();
  }
  return new MemoryOrderRepository();
}
