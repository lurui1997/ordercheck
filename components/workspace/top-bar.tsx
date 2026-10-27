import Link from "next/link";
import { mailPresentation } from "@/lib/ui/workspace-model";
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
  const mail = mailPresentation(config);
  const liveMail = mail.transport !== "recorded";
  const healthLabel = health.state === "loading" ? "检查中" : health.state === "ok" ? "正常" : health.state === "degraded" ? "缺配置" : "不可用";
  const healthTitle = healthTitleFor(health);
  const modeText = config.mode === "aws" ? `${config.modeLabel} · ${mail.label}` : `样例 · ${mail.label}`;

  return (
    <header className="flex min-h-[72px] items-center justify-between gap-3 border-b border-line bg-white px-5 sm:px-8">
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-2 focus:py-1 focus:text-sm"
      >
        跳到工作区
      </a>
      <p className="min-w-0 truncate text-[12px] text-[#8290a2]">
        <Link href="/" className="rounded-sm font-medium text-[#4a5d75] hover:text-accent">
          OrderCheck
        </Link>
        <span className="mx-2 text-[#c2cad6]">/</span>
        <span>{order ? order.id : "工作台"}</span>
      </p>
      <div className="flex shrink-0 items-center gap-3">
        <span
          className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] ${
            liveMail ? "border-[#d0eadc] bg-[#e9f7f0] text-ok" : "border-[#dde7fc] bg-[#eef3fd] text-[#49658f]"
          }`}
          title={mail.detail}
        >
          <i className={`mr-1.5 inline-block size-1.5 rounded-full ${liveMail ? "bg-ok" : "bg-[#6485c0]"}`} aria-hidden />
          {modeText}
        </span>
        <span className="hidden items-center gap-1.5 text-[11px] text-muted sm:inline-flex" title={healthTitle}>
          <i
            aria-hidden
            className={`size-1.5 rounded-full ${
              health.state === "ok" ? "bg-ok" : health.state === "degraded" ? "bg-attention" : health.state === "unavailable" ? "bg-danger" : "bg-[#6485c0]"
            }`}
          />
          健康 · {healthLabel}
        </span>
      </div>
    </header>
  );
}
