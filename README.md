# OrderCheck

跨境订单漏项核对助手。卖方在发送订单确认或形式发票之前，用它检查这一张订单的往来邮件和报价，找出还没对齐的关键事项。

默认 **DEMO_MODE** 使用确定性规则引擎跑通样例闭环。已接通 **Amazon Bedrock**（Converse + 结构化 tool）与 **Amazon SES**（SendEmail）适配器：配置齐全时真实调用；失败返回明确错误，**不会**把规则引擎或 AI Gateway 结果标成 Bedrock，也**不会**把「提交成功」写成「已投递」。

产品说明见 [docs/PRD.md](docs/PRD.md)，结构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。CDS 运行时对照见 [docs/CDS_RUNTIME.md](docs/CDS_RUNTIME.md)。AWS SAM 基础设施见 [infra/](infra/)。MIT 许可见 [LICENSE](LICENSE)。交接原文在 [docs/handoff](docs/handoff)。

## 生产地址

- 稳定别名：[https://ordercheck-lurui1997s-projects.vercel.app](https://ordercheck-lurui1997s-projects.vercel.app)
- 健康检查：`GET /api/health`
- 提交清单：[docs/SUBMISSION.md](docs/SUBMISSION.md)

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开 [http://127.0.0.1:43123](http://127.0.0.1:43123)。

```bash
npm test
npm run build
```

## 三分钟演示

1. 打开工作台，看清这是发确认之前的核对，不是已经成交。
2. 点击「加载 DEMO-001」。左侧是三封英文邮件，右侧还没有结论。
3. 点击「开始核对」。确认三个重要问题，并点引用回到原文：
   - 11 月 20 日同时出现，但一个是伦敦到货，一个是上海提货。
   - 买方要 sample v2，报价写 sample v1。
   - 买方要内托，报价只写了盒子 USD 2.40。
4. 看数量 1,000 套已经双方写明，不再追问。盒子单价没有被写成含内托的整套价格。
5. 点击「生成确认邮件」，可以改正文，然后「确认记录发送」。状态是未发送，页面写明没有调用 SES。
6. 在「样例回放」里逐条播放：
   - 买方再次要求 v2：日期和内托仍未确认。
   - 卖方给出整套新条件：相关事项变成待买方接受。
   - 买方逐项接受：打开「查看约定摘要」。
7. 摘要把已确认和未确认分开，并写明履约尚未开始。可选再播放「含糊回复」或「确认后改口」。

样例邮箱是 `buyer@example.com` 和 `seller@example.com`，不能用于真实发信。回放不是 SES 收件。

## 环境变量

复制 `.env.example`。样例模式不需要填写云配置。

```bash
cp .env.example .env.local
```

| 变量 | 说明 |
|---|---|
| `APP_MODE` / `AWS_MODE` | `demo`（默认）或 `aws` |
| `REVIEW_ENGINE` | `deterministic`（demo 默认）/ `bedrock` / `gateway`。AWS 模式未指定时强制 `bedrock` |
| `AWS_REGION` | Bedrock / SES 区域 |
| `BEDROCK_MODEL_ID` | 例如 `amazon.nova-lite-v1:0` |
| `BEDROCK_MAX_TOKENS` | 默认 `2400` |
| `AI_GATEWAY_API_KEY` | 无 AWS 密钥时的真 LLM 备份 |
| `AI_GATEWAY_MODEL` | 默认 `amazon/nova-lite` |
| `SES_FROM_ADDRESS` | 已验证发信地址；与 `AWS_REGION` 一起在 AWS 模式开启真发信 |
| `SES_REPLY_TO_ADDRESS` | 可选 Reply-To |
| `SES_CONFIGURATION_SET` | 可选 |
| `ORDERS_TABLE_NAME` / `RAW_EMAIL_BUCKET` / `INBOUND_DOMAIN` | Dynamo / S3 / 收件域名（配置后走真 SDK） |
| `INBOUND_WEBHOOK_SECRET` | 保护 `/api/aws/inbound` 与 `/api/aws/ses-events` |
| `BEDROCK_AGENT_RETRY` | 默认 `1`；引用丢弃过多时最多再 converse 一次 |

不要把访问密钥写进仓库。Bedrock / SES 使用本机或部署环境的默认凭证链（`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` 或 IAM 角色）。

### 如何开启各引擎

**Bedrock（推荐，比赛主路径）**

```bash
APP_MODE=aws   # 或 DEMO 下 REVIEW_ENGINE=bedrock
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
# 另需可用的 AWS 凭证，且账号已开通该模型
```

失败时 API 返回 `bedrock_*` 错误，**禁止**静默回退到规则引擎。

**AI Gateway 备份（标成 `ai_gateway`，不是 Bedrock）**

```bash
APP_MODE=demo
REVIEW_ENGINE=gateway
AI_GATEWAY_API_KEY=...
AI_GATEWAY_MODEL=amazon/nova-lite
```

**SES 真发信**

```bash
APP_MODE=aws
AWS_REGION=us-east-1
SES_FROM_ADDRESS=you@your-verified-domain
# 可选 SES_REPLY_TO_ADDRESS / SES_CONFIGURATION_SET
```

成功只记 `submit_succeeded` + MessageId。`delivered` / `bounce` / `complaint` 只能来自 `/api/aws/ses-events`。DEMO 模式始终 `recorded_not_sent`。

页面徽章与 `GET /api/config` 会显示 `DEMO_MODE` / `AWS_MODE`、`reviewEngine`、`sesLive`。

## 部署

应用在仓库根目录，框架是 Next.js。

- 在 Vercel 导入这个仓库，Framework Preset 选 Next.js，Root Directory 用仓库根。
- 不设置环境变量时就是 DEMO_MODE + deterministic，DEMO-001 可以完整走通。
- 构建命令 `npm run build`，没有单独的输出目录需要手填。
- 演示状态保存在浏览器。`/api/orders` 的进程内存储只供接口形状使用，新实例上是空的。
- 要在线上真调 Bedrock / SES / Gateway，在 Vercel 项目环境变量里配置上表项（不要提交到 Git）。

## 已实现、模拟、未实现

已实现：

- DEMO-001 加载、核对、证据定位、英文草稿、样例发送记录。
- 回复序列、含糊回复、确认后重开、人工决定和约定摘要。
- 引用必须出现在指定消息里。重复消息不会再次入账。
- DEMO_MODE / AWS_MODE 徽章、`reviewEngine` / `ses` 徽章、空状态和错误状态。
- **Amazon Bedrock Converse** 结构化核对（tool use）+ 引用校验 + `applyModelReview` 并入状态机。
- **Vercel AI Gateway** 备份路径（`engine: "ai_gateway"`）。
- **Amazon SES SendEmail**；成功仅 `submit_succeeded`。
- `POST /api/orders/:id/review` 返回真实 `engine` 值（不再写死 `deterministic_fixture`）。

模拟：

- DEMO 发送只记在订单里，投递状态是 `recorded_not_sent`。
- 样例回放和手工粘贴代替收件，来源标签分别是样例和手工录入。
- DEMO 默认核对是确定性规则引擎（可显式切到 bedrock / gateway）。

已实现（AWS 适配，需账号资源才运行时接通）：

- **DynamoDB** `DynamoOrderRepository`（`@aws-sdk/client-dynamodb` + `lib-dynamodb`）。
- **SES 入站** `handleInboundRecord`（S3 GetObject + MIME 解析 + `ses_inbound` + 去重）。
- **受保护** `POST /api/aws/inbound`、`POST /api/aws/ses-events`（`INBOUND_WEBHOOK_SECRET`）。
- **Bedrock agent 重试**（`BEDROCK_AGENT_RETRY=1`）与 `review_meta` / request id。
- **`GET /api/health`** 诊断布尔值。

未实现 / 后续：

- PDF、图片附件分析；WhatsApp / SMS 多渠道（见 [docs/SUBMISSION.md](docs/SUBMISSION.md)）。
- 完整 AgentCore 重写（可演进，非本版范围）。

## Hackathon judge path

English checklist for evaluators:

1. **Demo without AWS:** open the site → Load DEMO-001 → Start review → quote-backed issues → draft email → recorded send (`recorded_not_sent`) → scripted replies → agreement summary.
2. **Health:** `GET /api/health` — `mode`, `reviewEngine`, booleans for `bedrock` / `ses` / `dynamo` / `s3` / `gateway` / `inbound`, plus `missing` (never secrets).
3. **Switch AWS path:** set `AWS_MODE=true` (or `APP_MODE=aws`) and required vars from `.env.example`. AWS mode defaults `reviewEngine=bedrock` (no silent Gateway/deterministic fallback).
4. **Verify SES SDK path in code:** `lib/aws/ses.ts` constructs `SESClient` + `SendEmailCommand`. With `SES_FROM_ADDRESS` + `AWS_REGION` in AWS mode, send returns `submit_succeeded` + MessageId only — UI states this is **not** delivered.
5. **Request id screenshot:** with Bedrock or Gateway configured, run review; UI shows small text `引擎 … · request id …` (or gateway tokens) under 待确认事项; API also returns `meta` / `bedrockRequestId`.
6. **Inbound / events:** production should use SES→S3→Lambda → `handleInboundRecord`. Optional HTTPS forwarders require `Authorization: Bearer $INBOUND_WEBHOOK_SECRET` or `x-ordercheck-secret`. Delivery/bounce/complaint only via `/api/aws/ses-events`.
7. **Submission brief:** [docs/SUBMISSION.md](docs/SUBMISSION.md). Architecture honesty: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Real-call policy: [docs/adr/ADR-005-real-aws-calls-no-silent-fallback.md](docs/adr/ADR-005-real-aws-calls-no-silent-fallback.md).

## 接通说明（摘要）

1. 验证 SES 发信身份；测试收件人换成团队自己的地址。
2. 配好 Bedrock 模型权限；模型输出先做引用校验，再进入状态机。失败不回退规则引擎。
3. `lib/aws/ses.ts` 成功只能是 `submit_succeeded`；`delivered` 只能来自 SES 事件。
4. 配置 `ORDERS_TABLE_NAME` 启用 Dynamo；不要在失败时偷偷写回内存。
5. 配置 `INBOUND_WEBHOOK_SECRET` 后才能用 HTTP 入站/事件转发；否则 501。

行为规则见 [docs/adr](docs/adr)。
