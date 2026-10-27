import { Badge } from "@/components/ui/badge";
import { STAGE_LABEL } from "@/lib/labels";
import { enginePresentation, liveEnginePresentation, mailPresentation, objectStorePresentation, persistencePresentation, selectionLabel } from "@/lib/ui/workspace-model";
import type { Order, RuntimeConfig } from "@/lib/types";

export interface HealthChip {
  state: "loading" | "ok" | "degraded" | "unavailable";
  missing: string[];
  reviewEngine?: string;
  reviewEngineSelection?: string;
  liveEngine?: string | null;
  reviewEngineError?: string;
  persistence?: string;
  persistenceError?: string;
  objectStore?: string;
  deepseek?: boolean;
  ollama?: boolean;
  smtp?: boolean;
  sesLive?: boolean;
}

function healthTitleFor(health: HealthChip): string {
  const base =
    health.state === "degraded" && health.missing.length > 0
      ? `健康检查缺少 ${health.missing.join("、")}。`
      : health.state === "unavailable"
        ? "健康检查没有返回。"
        : health.state === "loading"
          ? "正在读取健康检查。"
          : "健康检查正常，没有缺失配置。";
  const reported: string[] = [];
  if (health.reviewEngine) {
    reported.push(`核对 ${health.reviewEngine}${health.reviewEngineSelection ? ` ${health.reviewEngineSelection}` : ""}`);
  }
  if (health.reviewEngineError) reported.push(health.reviewEngineError);
  if (health.liveEngine !== undefined) reported.push(`对照 ${health.liveEngine ?? "无"}`);
  if (health.persistence) reported.push(`存储 ${health.persistence}`);
  if (health.persistenceError) reported.push(health.persistenceError);
  if (health.objectStore) reported.push(`对象 ${health.objectStore}`);
  if (health.deepseek !== undefined) reported.push(`deepseek ${health.deepseek ? "已配置" : "未配置"}`);
  if (health.ollama !== undefined) reported.push(`ollama ${health.ollama ? "已配置" : "未配置"}`);
  if (health.smtp !== undefined) reported.push(`smtp ${health.smtp ? "已配置" : "未配置"}`);
  if (health.sesLive !== undefined) reported.push(`ses ${health.sesLive ? "真发信" : "未发信"}`);
  return reported.length > 0 ? `${base} ${reported.join(" · ")}。` : base;
}

export function TopBar({ config, order, health }: { config: RuntimeConfig; order: Order | null; health: HealthChip }) {
  const engine = enginePresentation(config.reviewEngine);
  const selection = selectionLabel(config.reviewEngineSelection);
  const live = liveEnginePresentation(config.liveEngine);
  const persistence = persistencePresentation(config);
  const mail = mailPresentation(config);
  const objectStore = objectStorePresentation(config.objectStore);
  const healthLabel = health.state === "loading" ? "检查中" : health.state === "ok" ? "正常" : health.state === "degraded" ? "缺配置" : "不可用";
  const healthTitle = healthTitleFor(health);

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
            <Badge tone={config.reviewEngineError ? "danger" : engine.code === "deterministic" ? "neutral" : "accent"} className="max-w-full">
              <span title={config.reviewEngineError ?? `${engine.detail} 选择方式 ${selection}。自动链是 DeepSeek，其次 Ollama，再次 AI Gateway，否则规则引擎。`}>
                核对 · {config.reviewEngineError ? "无效" : engine.label}
                <span className="ml-1 font-mono font-normal text-[10px]">{config.reviewEngineError ? "invalid" : engine.code}</span>
                <span className="ml-1 font-mono font-normal text-[10px]">{selection}</span>
              </span>
            </Badge>
          </li>
          <li>
            <Badge tone={config.liveEngine ? "accent" : "neutral"} className="max-w-full">
              <span title={live.detail}>
                对照 · {live.label}
                {config.liveEngine ? <span className="ml-1 font-mono font-normal text-[10px]">{live.code}</span> : null}
              </span>
            </Badge>
          </li>
          <li>
            <Badge tone={config.persistenceError ? "danger" : config.persistence === "memory" ? "neutral" : "attention"}>
              <span title={persistence.detail}>存储 · {persistence.label}</span>
            </Badge>
          </li>
          <li>
            <Badge tone={config.objectStore === "none" ? "neutral" : "accent"}>
              <span title={objectStore.detail}>对象 · {objectStore.label}</span>
            </Badge>
          </li>
          <li>
            <Badge tone={mail.transport === "recorded" ? "neutral" : "attention"}>
              <span title={mail.detail}>{mail.label}</span>
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
