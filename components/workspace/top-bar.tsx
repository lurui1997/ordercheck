import { Badge } from "@/components/ui/badge";
import { STAGE_LABEL } from "@/lib/labels";
import { enginePresentation, persistencePresentation, sesPresentation } from "@/lib/ui/workspace-model";
import type { Order, RuntimeConfig } from "@/lib/types";

export interface HealthChip {
  state: "loading" | "ok" | "degraded" | "unavailable";
  missing: string[];
}

export function TopBar({ config, order, health }: { config: RuntimeConfig; order: Order | null; health: HealthChip }) {
  const engine = enginePresentation(config.reviewEngine);
  const persistence = persistencePresentation(config);
  const ses = sesPresentation(config);
  const healthLabel = health.state === "loading" ? "检查中" : health.state === "ok" ? "正常" : health.state === "degraded" ? "缺配置" : "不可用";
  const healthTitle =
    health.state === "degraded" && health.missing.length > 0
      ? `健康检查缺少 ${health.missing.join("、")}`
      : health.state === "unavailable"
        ? "健康检查没有返回。"
        : health.state === "loading"
          ? "正在读取健康检查。"
          : "健康检查正常，没有缺失配置。";

  return (
    <header className="border-b border-line bg-surface">
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-2 focus:py-1 focus:text-sm focus:ring-2 focus:ring-accent"
      >
        跳到工作区
      </a>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5 text-ink">OrderCheck</p>
          <p className="text-[12px] leading-4 text-subtle">订单确认工作台</p>
        </div>
        <div className="min-w-0 flex-1">
          {order ? (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-ink">
                <span className="font-mono tabular-nums">{order.id}</span>
                <span className="mx-1.5 text-subtle">/</span>
                {order.name}
              </p>
              <p className="truncate text-[12px] text-subtle">
                {order.seller.name} → {order.buyer.name}
                <span className="mx-1.5">·</span>
                {STAGE_LABEL[order.stage] ?? order.stage}
              </p>
            </div>
          ) : (
            <p className="text-[13px] text-subtle">未加载订单</p>
          )}
        </div>
        <ul className="flex flex-wrap items-center gap-1.5" aria-label="运行状态">
          <li>
            <Badge tone={config.mode === "aws" ? "attention" : "neutral"}>{config.modeLabel}</Badge>
          </li>
          <li>
            <Badge tone={engine.code === "deterministic" ? "neutral" : "accent"} className="max-w-full">
              <span title={engine.detail}>
                核对 · {engine.label}
                <span className="ml-1 font-mono font-normal text-[10px]">{engine.code}</span>
              </span>
            </Badge>
          </li>
          <li>
            <Badge tone="neutral">
              <span title={persistence.detail}>存储 · {persistence.label}</span>
            </Badge>
          </li>
          <li>
            <Badge tone={config.sesLive ? "attention" : "neutral"}>
              <span title={ses.detail}>{ses.label}</span>
            </Badge>
          </li>
          <li>
            <span className="inline-flex items-center gap-1.5 rounded border border-line bg-zinc-50 px-1.5 py-0.5 text-[11px] font-semibold text-subtle" title={healthTitle}>
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${
                  health.state === "ok" ? "bg-emerald-700" : health.state === "degraded" ? "bg-amber-700" : health.state === "unavailable" ? "bg-red-700" : "bg-zinc-400"
                }`}
              />
              健康 · {healthLabel}
            </span>
          </li>
        </ul>
      </div>
    </header>
  );
}
