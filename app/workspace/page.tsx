import type { Metadata } from "next";
import { Workspace } from "@/components/workspace";
import { getRuntimeConfig } from "@/lib/aws/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "OrderCheck · 订单确认工作台",
  description: "卖方在发送订单确认前，核对双方往来里尚未对齐的交付、样品和包装范围。",
};

export default function WorkspacePage() {
  return <Workspace config={getRuntimeConfig()} />;
}
