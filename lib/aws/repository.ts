import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getRuntimeConfig } from "@/lib/aws/config";
import { openPostgresRepository } from "@/lib/oss/postgres-repository";
import { openSqliteRepository } from "@/lib/oss/sqlite-repository";
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

type EnvLike = Record<string, string | undefined>;

/**
 * Postgres when DATABASE_URL is set; else SQLite when PERSISTENCE=sqlite;
 * else DynamoDB on the legacy AWS path; else memory.
 * Misconfigured explicit modes throw — they do not silently use memory.
 */
export function createOrderRepository(env: EnvLike = process.env): OrderRepository {
  const config = getRuntimeConfig(env);
  if (config.persistenceError) {
    throw new Error(config.persistenceError);
  }
  if (config.persistence === "postgres") {
    return openPostgresRepository(env.DATABASE_URL ?? "");
  }
  if (config.persistence === "sqlite") {
    return openSqliteRepository(env.SQLITE_PATH?.trim() || ".data/orders.sqlite");
  }
  if (config.persistence === "dynamo") {
    return new DynamoOrderRepository({
      tableName: env.ORDERS_TABLE_NAME,
      region: env.AWS_REGION,
    });
  }
  return new MemoryOrderRepository();
}
