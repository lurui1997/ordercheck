# ADR-003: Issue state machine and confirmation evidence

- Status: Accepted
- Date: 2026-10-24

## Context

核对最容易错的地方，是把「讨论过」写成「确认过」。DEMO-001 里，11 月 20 日同时出现在伦敦到货和上海提货上；买方要求 sample v2，报价写 sample v1；买方要求内托，报价只给了盒子单价。

交接文档给出的状态方向是：

```text
unconfirmed → question_sent → proposed → confirmed
                         ↘ needs_human_review
unconfirmed / proposed → accepted_risk
confirmed → reopened
```

确认必须同时留下提出条件的一方和接受条件的另一方。同一封邮件里的「按之前说的」不能自动证明双方已经确认。

## Decision

事项状态为：

`unconfirmed`、`question_sent`、`proposed`、`confirmed`、`needs_human_review`、`accepted_risk`、`reopened`、`not_applicable`。

确认规则：

- 一个条款确认，仅当买卖双方最新表述是同一个明确取值，并且至少一方是 `accept`。
- 买方要求和卖方报价取值不同，保持 `unconfirmed`，类型用 `conflict` 或 `missing`。相同的日期如果里程碑不同，按不同取值处理。
- 一方提出具体新条件、另一方还没接受，进入 `proposed`，`waiting_for` 指向还没接受的那一方。
- 「should be fine」「as discussed」「no worries」「应该赶得上」「按之前说的」不产生表述，因此不改变确认状态。
- 卖方只写 “We confirm sample v2.” 时，只确认样品版本。到货和内托保持原状态。
- 卖方在一封「请确认是否接受更新报价」的邮件里承诺伦敦到货和整套价格时，这些是 `offer`，不是双方确认。样品版本例外：卖方用 “We confirm sample v2” 接受了买方已经写明的版本。
- 确认之后如果卖方提议替换样品并写明需要批准，只把样品事项从 `confirmed` 改为 `reopened`。不自动接受新版本，也不重开没有被提到的条款。
- 用户标记接受风险、人工核实或不适用时必须填写理由，并记录操作者。接受风险不是双方约定，不进入已确认摘要。
- 已确认事项不能被用户改成接受风险。
- 每条证据的 `quote` 必须是所引用消息正文的子串。规则引擎丢弃无法定位的句子，没有证据的事项不创建。
- 相同 `message.id` 再次入账时整单不变。样例外发邮件的来源是 `demo_outbound`，不参与表述提取，避免询问信里的词语把问题关掉。
- 已经是 `question_sent` 的同一批事项，在没有新回复前不能再次记录发送。

数量双方都写明 1,000 时成为已确认事实，不生成问题。USD 2.40 只作为盒子单价的单方陈述；整套 USD 2.60 确认之后，2.40 改为历史价格。

## Consequences

- DEMO-001 的部分回复、含糊回复、整包接受和确认后改口都有确定结果，测试可以锁住。
- 规则认的是这套明确句式。换一种说法确认同一件事时，样例引擎会保持未确认，而不是猜测。这是故意的，避免含糊关闭。
- Bedrock 以后可以提议新的表述，但必须产出同样的证据结构；引用校验失败的句子仍然不能进事实列表。
- 摘要可能比一封「看起来都同意了」的邮件更短。缺的字段保持空白。
