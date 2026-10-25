# ADR-004: Structured schema for review issues

- Status: Accepted
- Date: 2026-10-24

## Context

交接文档要求核对结果以结构化对象交给界面，而不是让前端从一大段说明里猜问题、引用和状态。模型如果自由发挥，容易写出输入里不存在的交期或价格，也容易把三个问题揉进一段无法逐条更新的文字。

样例引擎和将来的 Bedrock 调用需要返回同一种形状，界面和摘要才不用分两套解析。

## Decision

单条事项的合同见 `lib/review/schema.ts` 里的 `reviewIssueJsonSchema`。核心字段与交接文档一致：

- `issue_id`
- `kind`：`missing`、`ambiguous`、`conflict`
- `priority`：`high` 或 `low`
- `title`
- `evidence[]`：`message_id` + `quote`
- `impact`
- `question`
- `status`
- `waiting_for`：`buyer`、`seller`、`both`、`none`
- `resolution_evidence[]`

另外有订单级 `facts[]`，用来放已经明确的数量、单方盒子单价和后来的整套价格。事实不是问题，界面不把它们放进待追问列表。

DEMO-001 的高优先级 `issue_id` 固定为 `delivery_milestone`、`sample_version`、`inserts_scope`。次要项为 `shipping_charges`、`payment_terms`、`acceptance_process`。

Bedrock 请求把这个 JSON Schema 和当前订单消息一起送入。返回值先做引用校验，再进入 ADR-003 的状态合并。Schema 不包含 `expected_issues`。验收用的期望问题只存在于测试，不进入分析输入。

建议问句使用英文，因为确认邮件默认发给买方。卡片标题和缺口说明使用中文，因为操作的人是卖方。

## Consequences

- 界面可以按字段渲染卡片、摘要和草稿，不需要解析自然语言列表。
- 测试可以直接断言 `issue_id`、状态和引用子串。
- 模型输出如果缺字段或引用不在原文里，应作为可见错误留下，而不是补写一条看起来完整的问题。
- Schema 现在是 JSON Schema 常量，还没有接到 Bedrock Converse 的工具定义。接通时保持字段名不变。
