import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { OrderRepository } from "@/lib/aws/repository";
import type { Order } from "@/lib/types";

const globalSql = globalThis as typeof globalThis & {
  __ordercheckSqlite?: SqliteOrderRepository;
  __ordercheckSqlitePath?: string;
};

export class SqliteOrderRepository implements OrderRepository {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  }

  async get(id: string): Promise<Order | null> {
    const row = this.db.prepare("SELECT payload FROM orders WHERE id = ?").get(id) as { payload?: string } | undefined;
    if (!row?.payload) return null;
    return JSON.parse(row.payload) as Order;
  }

  async save(order: Order): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO orders (id, payload, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      )
      .run(order.id, JSON.stringify(order), new Date().toISOString());
  }
}

export function openSqliteRepository(file = ".data/orders.sqlite"): SqliteOrderRepository {
  if (file === ":memory:") {
    return new SqliteOrderRepository(new DatabaseSync(":memory:"));
  }
  const resolved = path.resolve(file);
  if (globalSql.__ordercheckSqlite && globalSql.__ordercheckSqlitePath === resolved) {
    return globalSql.__ordercheckSqlite;
  }
  mkdirSync(path.dirname(resolved), { recursive: true });
  const repo = new SqliteOrderRepository(new DatabaseSync(resolved));
  globalSql.__ordercheckSqlite = repo;
  globalSql.__ordercheckSqlitePath = resolved;
  return repo;
}
