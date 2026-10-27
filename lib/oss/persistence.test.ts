import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createOrderRepository } from "@/lib/aws/repository";
import { PostgresOrderRepository } from "@/lib/oss/postgres-repository";
import { openSqliteRepository } from "@/lib/oss/sqlite-repository";
import { createOrderFromScenario } from "@/lib/scenario";

describe("OSS persistence", () => {
  it("round-trips an order in SQLite", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ordercheck-sqlite-"));
    const repo = openSqliteRepository(path.join(dir, "orders.sqlite"));
    const order = createOrderFromScenario();
    await repo.save(order);
    const loaded = await repo.get(order.id);
    expect(loaded?.id).toBe(order.id);
    expect(loaded?.messages.length).toBe(order.messages.length);
    expect(await repo.get("missing")).toBeNull();
  });

  it("round-trips an order through a mocked Postgres query", async () => {
    const rows = new Map<string, string>();
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.startsWith("create table")) return [];
      if (sql.startsWith("select")) {
        const payload = rows.get(String(params[0]));
        return payload ? [{ payload }] : [];
      }
      rows.set(String(params[0]), String(params[1]));
      return [];
    });
    const repo = new PostgresOrderRepository(query);
    const order = createOrderFromScenario();
    await repo.save(order);
    expect(await repo.get(order.id)).toMatchObject({ id: order.id });
    expect(query.mock.calls.some((call) => String(call[0]).includes("on conflict"))).toBe(true);
  });

  it("selects postgres, sqlite, then memory without opening AWS", () => {
    const postgres = createOrderRepository({
      DATABASE_URL: "postgres://ordercheck:ordercheck@127.0.0.1:5432/ordercheck",
    });
    expect(postgres).toBeInstanceOf(PostgresOrderRepository);

    const dir = path.join(tmpdir(), `ordercheck-select-${Date.now()}`);
    const sqlite = createOrderRepository({ PERSISTENCE: "sqlite", SQLITE_PATH: path.join(dir, "orders.sqlite") });
    expect(sqlite.constructor.name).toBe("SqliteOrderRepository");

    const memory = createOrderRepository({ APP_MODE: "demo" });
    expect(memory.constructor.name).toBe("MemoryOrderRepository");
  });

  it("refuses an explicit postgres mode that has no DATABASE_URL", () => {
    expect(() => createOrderRepository({ PERSISTENCE: "postgres" })).toThrow(/DATABASE_URL/);
  });
});
