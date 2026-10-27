import postgres from "postgres";
import type { OrderRepository } from "@/lib/aws/repository";
import type { Order } from "@/lib/types";

export interface SqlQuery {
  (sql: string, params: unknown[]): Promise<Array<Record<string, unknown>>>;
}

const SCHEMA = `create table if not exists orders (
  id text primary key,
  payload text not null,
  updated_at timestamptz not null default now()
)`;

const globalPg = globalThis as typeof globalThis & {
  __ordercheckPostgres?: PostgresOrderRepository;
  __ordercheckPostgresUrl?: string;
};

export class PostgresOrderRepository implements OrderRepository {
  private ready: Promise<void> | null = null;

  constructor(private readonly query: SqlQuery) {}

  private async ensure(): Promise<void> {
    if (!this.ready) {
      this.ready = this.query(SCHEMA, [])
        .then(() => undefined)
        .catch((error: unknown) => {
          this.ready = null;
          throw error;
        });
    }
    await this.ready;
  }

  async get(id: string): Promise<Order | null> {
    await this.ensure();
    const rows = await this.query("select payload from orders where id = $1", [id]);
    const payload = rows[0]?.payload;
    if (typeof payload !== "string" || !payload) return null;
    return JSON.parse(payload) as Order;
  }

  async save(order: Order): Promise<void> {
    await this.ensure();
    await this.query(
      `insert into orders (id, payload, updated_at) values ($1, $2, $3)
       on conflict (id) do update set payload = excluded.payload, updated_at = excluded.updated_at`,
      [order.id, JSON.stringify(order), new Date().toISOString()],
    );
  }
}

export function openPostgresRepository(databaseUrl: string): PostgresOrderRepository {
  const url = databaseUrl.trim();
  if (!url) {
    throw new Error("PostgresOrderRepository 需要 DATABASE_URL。没有回退到内存。");
  }
  if (globalPg.__ordercheckPostgres && globalPg.__ordercheckPostgresUrl === url) {
    return globalPg.__ordercheckPostgres;
  }
  const sql = postgres(url, { max: 4, idle_timeout: 20 });
  const query: SqlQuery = async (text, params) => {
    const rows = await sql.unsafe(text, params as never[]);
    return rows.map((row) => ({ ...row }));
  };
  const repo = new PostgresOrderRepository(query);
  globalPg.__ordercheckPostgres = repo;
  globalPg.__ordercheckPostgresUrl = url;
  return repo;
}
