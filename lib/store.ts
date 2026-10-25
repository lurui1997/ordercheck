import type { Order } from "@/lib/types";

const globalStore = globalThis as typeof globalThis & {
  __ordercheckOrders?: Map<string, Order>;
};

function bucket(): Map<string, Order> {
  if (!globalStore.__ordercheckOrders) globalStore.__ordercheckOrders = new Map();
  return globalStore.__ordercheckOrders;
}

export function getOrder(id: string): Order | null {
  return bucket().get(id) ?? null;
}

export function saveOrder(order: Order): void {
  bucket().set(order.id, structuredClone(order));
}
