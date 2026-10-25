# OrderCheck 架构

版本：2026-10-25。有两条路径：现在就能公开跑通的演示路径，以及交接文档里的 AWS 目标路径。演示路径是实现；目标路径是接口和失败行为，不是已经接通的云资源。

## 业务流

卖方在发形式发票之前，把这一张订单的邮件和报价交给 OrderCheck。系统列出有原文的缺口，卖方编辑并确认一封英文询问。对方的新回复只改变相关事项。双方都写明并接受之后，才进入约定摘要。

```mermaid
flowchart TD
  startNode["卖方准备发订单确认或 PI"] --> collect["汇集本订单邮件和报价文本"]
  collect --> review["开始核对"]
  review --> issues["最多 3 个高优先级问题，次要缺口仍可见"]
  issues --> read["查看原文、缺口、建议问句"]
  read --> draft["生成英文确认邮件并允许编辑"]
  draft --> confirm{"卖方确认发送?"}
  confirm -->|否| draft
  confirm -->|DEMO_MODE| recorded["记录外发，状态为未发送"]
  confirm -->|AWS_MODE 且已接通| submitted["SES 接受提交"]
  recorded --> reply["买方或卖方的新回复"]
  submitted --> reply
  reply --> update["只更新相关事项"]
  update --> agreed{"关键条款是否双方明确接受?"}
  agreed -->|否| read
  agreed -->|是| summary["摘要：已确认 / 未确认 / 已接受风险"]
  summary --> pi["下一步准备与约定一致的 PI"]
```

样例回放走同一条「新回复」分支，但来源标签是样例或手工录入。它不进入 SES 收件。

事项状态：

```mermaid
stateDiagram-v2
  [*] --> unconfirmed
  unconfirmed --> question_sent: 卖方确认记录询问
  unconfirmed --> proposed: 一方提出明确条件
  question_sent --> proposed: 回复提出明确条件
  proposed --> confirmed: 另一方明确接受
  unconfirmed --> confirmed: 双方最新表述一致且有接受
  unconfirmed --> accepted_risk: 用户写明理由
  proposed --> accepted_risk: 用户写明理由
  question_sent --> needs_human_review: 用户写明理由
  confirmed --> reopened: 后续材料提出实质变更
  reopened --> proposed: 新条件等待接受
  reopened --> confirmed: 双方重新明确接受
```

没有新的明确条件时，`question_sent` 保持已提问。含糊回复不产生迁移。

## 技术架构

```mermaid
flowchart LR
  subgraph demoPath ["A. 演示路径：现在运行"]
    browser["浏览器工作台"]
    engine["确定性核对引擎"]
    local["localStorage"]
    routes["Route Handlers"]
    memory["进程内订单存储"]
    browser --> engine
    browser --> local
    routes --> engine
    routes --> memory
  end

  subgraph awsPath ["B. AWS 路径：适配器已实现（需账号资源）"]
    routesAws["Next.js Route Handlers"]
    bedrock["Amazon Bedrock Converse"]
    dynamo["DynamoDB Orders"]
    ses["Amazon SES SendEmail"]
    bucket["S3 原始 MIME"]
    inboundApi["POST /api/aws/inbound"]
    eventsApi["POST /api/aws/ses-events"]
    routesAws --> bedrock
    routesAws --> dynamo
    routesAws --> ses
    ses --> bucket
    bucket --> inboundApi
    inboundApi --> dynamo
    eventsApi --> dynamo
  end

  browser -. "APP_MODE=aws / REVIEW_ENGINE 时走适配器" .-> routesAws
```

### Infrastructure as Code

可部署定义（评委可审，本地可不 `sam deploy`）在 [`infra/`](../infra/)：

- `infra/template.yaml` — AWS SAM：SES 收件规则概念、加密且阻止公有的 S3 原始邮件桶、S3→Lambda→`POST /api/aws/inbound`、SES 事件 SNS→Lambda→`POST /api/aws/ses-events`、DynamoDB `ORDERS_TABLE_NAME`、应用运行时 IAM（Bedrock `InvokeModel`/`Converse`、SES `SendEmail`、S3 `GetObject`、DynamoDB CRUD）
- `infra/README.md` — 参数（Domain / FromAddress / AppBaseUrl / WebhookSecret）、如何接 Vercel 环境变量、与应用代码对应关系
- 运行时 SDK 逐文件对照见 [`CDS_RUNTIME.md`](./CDS_RUNTIME.md)

### 已实现适配器 vs 需账号资源

| 能力 | 代码状态 | 运行时前提 |
|---|---|---|
| Bedrock Converse + tool + 可选 1 次 agent 重试 | 已实现 `lib/aws/bedrock.ts` | `AWS_REGION` + `BEDROCK_MODEL_ID` + 模型权限 |
| SES SendEmail | 已实现 `lib/aws/ses.ts` | AWS 模式 + 已验证 `SES_FROM_ADDRESS` |
| DynamoDB 整单 JSON | 已实现 `DynamoOrderRepository` | `ORDERS_TABLE_NAME`；否则 Memory |
| S3 GetObject 入站 MIME | 已实现 `handleInboundRecord` | `RAW_EMAIL_BUCKET` + IAM |
| 入站 / 投递事件 HTTP | 已实现受保护 API | `INBOUND_WEBHOOK_SECRET`；生产优先 Lambda 直调 |
| AI Gateway | 已实现备份引擎 | `AI_GATEWAY_API_KEY`；标签永远是 `ai_gateway` |

入站与事件：

```mermaid
flowchart TD
  sesIn["SES receipt rule"] --> s3["S3 raw MIME"]
  s3 --> lambda["Lambda 或 EventBridge"]
  lambda -->|"直调 handleInboundRecord\n或 Bearer 调 /api/aws/inbound"| apply["关联订单 + messageId 去重 + applyReply"]
  sesOut["SES SendEmail"] --> submit["outbound: submit_succeeded"]
  sesEvt["SES → SNS 事件"] --> events["POST /api/aws/ses-events"]
  events --> status["delivered / bounce / complaint"]
```

演示页面直接调用引擎，所以刷新后仍能从浏览器恢复，也不依赖某一次无服务器实例还活着。Route Handler 使用同一套函数，方便以后把页面改成调用 API。

## C4

### Context

```mermaid
C4Context
  title OrderCheck system context
  Person(seller, "Seller", "Export sales owner preparing an order confirmation")
  Person(buyer, "Buyer", "Overseas purchaser on the same order")
  System(ordercheck, "OrderCheck", "Finds unconfirmed terms in the supplied emails and quotation")
  System_Ext(mailboxes, "Mailboxes", "Buyer and seller mailboxes")
  System_Ext(aws, "AWS", "Bedrock, SES, DynamoDB and S3 on the target path")
  Rel(seller, ordercheck, "Reviews issues, edits the email, reads the summary")
  Rel(ordercheck, mailboxes, "Sends a confirmation email after the seller accepts")
  Rel(buyer, mailboxes, "Replies on the same order")
  Rel(mailboxes, ordercheck, "Inbound reply on the target path")
  Rel(ordercheck, aws, "Model, mail and storage when AWS_MODE is actually connected")
```

演示路径上，买卖双方的邮件是用户加载或粘贴的文本。系统不登录他们的邮箱。

### Container

```mermaid
C4Container
  title OrderCheck containers
  Person(seller, "Seller")
  Container(web, "Next.js app", "TypeScript, React", "Order workspace, demo API and review engine")
  Container(browserStore, "Browser store", "localStorage", "Demo order persistence")
  ContainerDb(memory, "Process memory", "Map", "Ephemeral API store for the documented routes")
  Container_Ext(bedrock, "Amazon Bedrock", "LLM", "Target reviewer, not called yet")
  Container_Ext(ses, "Amazon SES", "Email", "Target outbound and inbound mail")
  Container_Ext(dynamo, "DynamoDB", "Tables", "Target order, message and issue store")
  Container_Ext(s3, "Amazon S3", "Bucket", "Target raw MIME store")
  Rel(seller, web, "Uses")
  Rel(web, browserStore, "Saves the demo order")
  Rel(web, memory, "Reads and writes when an API route is called")
  Rel(web, bedrock, "Would review in AWS_MODE")
  Rel(web, ses, "Would send after seller confirmation")
  Rel(ses, s3, "Would store inbound raw mail")
  Rel(web, dynamo, "Would replace the demo stores")
```

### Component

组件图描述 Next.js 应用内部。AWS 适配器在同一应用里，是目标路径的边界，不是已部署的 Lambda。

```mermaid
C4Component
  title Components inside the Next.js app
  Container_Boundary(app, "Next.js app") {
    Component(ui, "Workspace UI", "React", "Messages, issue cards, draft, replay and summary")
    Component(routes, "Route handlers", "App Router", "Orders, review, draft, send, decision, summary")
    Component(engine, "Review engine", "TypeScript", "Quote-checked issues and the state machine")
    Component(draft, "Draft builder", "TypeScript", "English confirmation email")
    Component(summary, "Summary builder", "TypeScript", "Confirmed, open and accepted risk")
    Component(adapters, "AWS adapters", "TypeScript", "Bedrock, SES, inbound and repository stubs")
    Component(store, "Memory store", "process Map", "API persistence for one instance")
  }
  Rel(ui, engine, "Reviews, applies replies, records demo outbound")
  Rel(ui, draft, "Builds an editable email")
  Rel(ui, summary, "Reads the agreement")
  Rel(routes, engine, "Uses the same functions")
  Rel(routes, adapters, "Calls only in AWS_MODE")
  Rel(routes, store, "Loads and saves orders")
```

## 演示路径

| 步骤 | 实现 |
|---|---|
| 加载 DEMO-001 | `createOrderFromScenario()` 读取 `docs/handoff/demo-scenario.json` 的订单和初始邮件 |
| 核对 | `reviewOrder()`。不读取 `expected_issues` |
| 草稿 | 三个高优先级问题都还开放时，使用交接文档中的英文草稿；否则按所选问题生成，不新增商业承诺 |
| 发送 | `recordOutbound()`。状态 `recorded_not_sent` |
| 回放 | `applyReply()`，来源 `fixture` 或 `manual` |
| 摘要 | `buildSummary()` |
| 持久化 | 浏览器 `localStorage` 键 `ordercheck.demo.v1` |

页面徽章：

- `DEMO_MODE`：默认。
- `AWS_MODE`：`APP_MODE=aws` 或 `AWS_MODE=true`。

## 目标 AWS 路径

```mermaid
flowchart TD
  page["Seller workspace"] --> http["API Gateway"]
  http --> lambda["Lambda"]
  lambda --> model["Bedrock structured output"]
  lambda --> table["DynamoDB"]
  lambda --> send["SES SendEmail"]
  send --> buyerBox["Buyer mailbox"]
  buyerBox --> rule["SES receipt rule"]
  rule --> raw["S3 raw MIME"]
  raw --> inbound["Inbound Lambda"]
  inbound --> table
  inbound --> model
```

建议的最小资源：

- Amazon Bedrock：抽取证据、提出补问、判断新回复影响。输出必须符合 `lib/review/schema.ts`。
- Amazon SES：发信和收信。发信 API 成功只记 `submit_succeeded`。投递事件才记 `delivered`。
- DynamoDB：订单、消息、事项状态、发送记录、确认历史。
- S3：原始 MIME。附件以后再分析，不执行邮件里的指令。
- AgentCore 不是首版前提。

入站处理要做的事：用随机订单回复标识和已登记参与方关联会话；去掉引用历史和自动签名；按 message id 去重；关联不上的邮件保持人工处理。重试不能再次创建同一问题或再次发信。这些规则的演示版已经做在引擎里，云上入口是 `handleInboundRecord`。

## 环境变量

见 `.env.example`。仓库不放密钥，也不放可用的真实邮箱。

| 变量 | 用途 |
|---|---|
| `APP_MODE` | `demo` 或 `aws` |
| `DEMO_MODE` | 设为 `true` 表示样例。不能覆盖已经打开的 AWS 模式 |
| `AWS_MODE` | `true` 等价于 `APP_MODE=aws` |
| `AWS_REGION` | Bedrock 和 SES 区域 |
| `BEDROCK_MODEL_ID` | 结构化核对用的模型 |
| `BEDROCK_MAX_TOKENS` | 预留的输出上限 |
| `ORDERS_TABLE_NAME` | 订单表 |
| `MESSAGES_TABLE_NAME` | 消息表 |
| `ISSUE_EVENTS_TABLE_NAME` | 状态历史表 |
| `RAW_EMAIL_BUCKET` | 原始 MIME |
| `SES_FROM_ADDRESS` | 已验证的发信身份 |
| `SES_REPLY_TO_ADDRESS` | 订单回复地址 |
| `SES_CONFIGURATION_SET` | 投递事件 |
| `INBOUND_DOMAIN` | 收件域名 |

AWS 模式如果缺前六个关键项里的任何一个，配置接口会返回缺失的变量名。

## 接口形状

演示 API 和目标 API 使用同一路径。入站邮件不是其中的公网 POST。

| 方法 | 路径 | 行为 |
|---|---|---|
| `GET` | `/api/config` | 模式、缺失变量名、各项是否已填写 |
| `POST` | `/api/orders` | `{ "fixture": "DEMO-001" }` 创建未核对订单 |
| `GET` | `/api/orders/:id` | 读取订单 |
| `POST` | `/api/orders/:id/messages` | 追加材料或回复。拒绝 `ses_inbound` |
| `POST` | `/api/orders/:id/review` | 按 `reviewEngine` 真实核对；返回 `engine` / `meta`（含 request id） |
| `POST` | `/api/orders/:id/email-draft` | `{ "issue_ids": [] }` 生成草稿 |
| `POST` | `/api/orders/:id/send` | DEMO 记 `recorded_not_sent`；AWS+SES 真发 → `submit_succeeded` |
| `GET` | `/api/health` | mode、引擎、bedrock/ses/dynamo/s3/gateway/inbound 布尔与 missing |
| `POST` | `/api/aws/inbound` | 受保护入站（需 `INBOUND_WEBHOOK_SECRET`） |
| `POST` | `/api/aws/ses-events` | 受保护 SES 事件 → delivered/bounce/complaint |
| `POST` | `/api/orders/:id/issues/:issueId/decision` | `{ decision, reason, actor }` |
| `GET` | `/api/orders/:id/summary` | 约定摘要 |

错误体：

```json
{ "error": { "code": "ses_not_implemented", "message": "SES 发信适配器尚未接通。样例模式只会把外发记在订单里。" } }
```

订单、事项和摘要的 TypeScript 形状在 `lib/types.ts`。Bedrock 目标请求在 `lib/aws/bedrock.ts`：`{ modelId, region, order, schema }`。SES 目标请求在 `lib/aws/ses.ts`：`{ from, to, replyTo, subject, textBody, configurationSet }`，成功时只允许 `{ messageId, status: "submit_succeeded" }`。

DynamoDB 单条订单文档可以先按 `Order` 整存。消息多了以后再拆到 `MESSAGES_TABLE_NAME`，事项历史拆到 `ISSUE_EVENTS_TABLE_NAME`。

## 持久化与幂等

- 浏览器保存整张 `Order`。重新加载样例会覆盖它。
- API 的 `MemoryOrderRepository` 挂在进程上。新实例是空的，`GET` 返回 404。
- `DynamoOrderRepository` 在 AWS 模式且表名已填时用 SDK 读写；失败会抛错，不会静默写到内存里冒充已经入库。
- 消息 id 重复时返回 409，不追加历史，不追加外发。
- 同一组已经是「已提问」的事项不能再次记录发送。

## 失败时用户看到什么

- 没有材料就核对：请先加载邮件。
- 空回复、空理由、空收件人：停在原状态，并写明缺什么。
- 引用无法在原文定位：该条证据不出现。
- AWS 模式缺少配置或适配器未接通：红色说明，不出现「已投递」或「模型已核对」。
- 本机样例损坏：忽略本地缓存，可以重新加载 DEMO-001。

## 接通 SES 和 Bedrock 的下一步

1. 在所选区域验证发信身份，确认沙箱是否只能发给已验证地址。把测试邮箱换成团队自己的地址，不要用 example.com。
2. 配置收件域名和 MX，让回复进入 S3。用一封真实邮件跑通 `handleInboundRecord` 的去重和订单关联。
3. 给 Bedrock 调用接上 Converse 或等价 API，强制 `reviewIssueJsonSchema`。返回后跑现有的引用校验和状态合并。
4. 只有 SES 事件把投递状态写成 `delivered`。发送函数本身不得写这个状态。
5. 用 DynamoDB 替换两个演示存储之前，先保持样例模式可一键复现。
6. 补一条真实发信和真实收件的演示记录：message id、原始对象键、状态变化。不要补写节省金额。
