# ADR-002: Sample mode first, SES and Bedrock behind flags

- Status: Accepted
- Date: 2026-10-24

## Context

交接文档要求最终用 Bedrock 分析、用 SES 真实收发。它也允许在 SES 还没准备好时并行做样例模式。当前仓库没有可提交的发信身份、收件域名和模型权限。

如果在没有这些条件时返回一个看起来成功的 SES message id，或者把规则引擎的结果标成模型输出，演示会变成假集成。

样例邮箱使用 example.com，交接文档写明不能用于真实发信。

## Decision

默认 `APP_MODE=demo`（页面徽章 `DEMO_MODE`）。

- 核对使用确定性规则引擎。它只读邮件正文，不读 `expected_issues`。
- 「发送」调用 `recordOutbound`，投递状态固定为 `recorded_not_sent`。文案写明没有调用 SES。
- 回放和手工粘贴的来源只能是 `fixture` 或 `manual`。页面和 `POST /api/orders/:id/messages` 都拒绝 `ses_inbound`。
- `APP_MODE=aws` 或 `AWS_MODE=true` 时徽章改为 `AWS_MODE`。缺少配置时列出缺失的环境变量名，不列出密钥。
- Bedrock 和 SES 适配器在未接通时抛出明确错误：`bedrock_not_configured`、`bedrock_not_implemented`、`ses_not_configured`、`ses_not_implemented`。它们不返回虚构的成功。
- 入站邮件的目标入口是 `handleInboundRecord`，由 SES 收到 S3 事件后调用。不提供可伪造买方确认的公网接口。

真实调用留到发信身份、收件 MX 和模型权限都可用之后。成功的 SES API 响应只表示「已提交」，只有后续投递事件才能写成「已投递」。

## Consequences

- 现在的三分钟演示是可复现的样例闭环，不是真实收发证据。
- 评委不会把样例记录误认成 SES 投递。
- AWS 路径的环境变量和函数签名已经固定，后续接 SDK 时不用改状态机。
- 样例规则引擎只保证 DEMO-001 和同一类明确表述。换一封结构不同的邮件，在 Bedrock 接通之前不应假装能核对。
- 正式提交如果要求运行时真实通信，需要在此 ADR 之外再完成一次真实发信和收件，并保留 message id。
