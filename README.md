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
| `REVIEW_ENGINE` | 留空或 `auto`：Gateway → DeepSeek（有密钥）→ Bedrock（区域+模型+凭证）→ `deterministic`。显式 `deterministic` / `bedrock` / `gateway` / `deepseek` 覆盖 auto |
| `AWS_REGION` | Bedrock / SES 区域 |
| `BEDROCK_MODEL_ID` | 例如 `amazon.nova-lite-v1:0` |
| `BEDROCK_MAX_TOKENS` | 默认 `2400` |
| `AI_GATEWAY_API_KEY` | 无 AWS 密钥时的真 LLM 备份 |
| `AI_GATEWAY_MODEL` | 默认 `amazon/nova-lite` |
| `DEEPSEEK_API_KEY` | DeepSeek 密钥。有值时 `health.deepseek` 为 true（只表示已配置） |
| `DEEPSEEK_BASE_URL` | 默认 `https://api.deepseek.com/v1`（OpenAI 兼容 chat completions） |
| `DEEPSEEK_MODEL` | 默认 `deepseek-chat` |
| `SES_FROM_ADDRESS` | 已验证发信地址；与 `AWS_REGION` 一起在 AWS 模式开启真发信 |
| `SES_REPLY_TO_ADDRESS` | 可选 Reply-To |
| `SES_CONFIGURATION_SET` | 可选 |
| `ORDERS_TABLE_NAME` + `AWS_REGION` + `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | 三者齐全才 `dynamo: true` 并使用 DynamoDB；否则内存。表名单独存在不算接通 |
| `INBOUND_WEBHOOK_SECRET` | 保护 `/api/aws/inbound` 与 `/api/aws/ses-events` |
| `BEDROCK_AGENT_RETRY` | 默认 `1`；引用丢弃过多时最多再 converse 一次 |

不要把访问密钥写进仓库。Bedrock / SES 使用本机或部署环境的默认凭证链（`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` 或 IAM 角色）。

### 如何开启各引擎

**自动选择（`REVIEW_ENGINE` 留空或 `auto`）**

1. 有 `AI_GATEWAY_API_KEY` → `ai_gateway`
2. 否则有 `DEEPSEEK_API_KEY` → `deepseek`（OpenAI 兼容，`https://api.deepseek.com/v1`，模型默认 `deepseek-chat`）
3. 否则有 `AWS_REGION` + `BEDROCK_MODEL_ID` + AWS 凭证（`AWS_ACCESS_KEY_ID` 与 `AWS_SECRET_ACCESS_KEY`，或 Web Identity / 容器凭证环境变量）→ `bedrock`
4. 否则 → `deterministic`

显式 `REVIEW_ENGINE=deterministic|bedrock|gateway|deepseek` 始终覆盖上面的顺序。失败返回对应引擎的错误，**不会**把规则引擎结果标成 Bedrock、Gateway 或 DeepSeek。DeepSeek 草稿失败同样直接报错，不替换成确定性模板。页面徽章区分 `review:`（配置将使用的引擎）和 `ran:`（这次实际跑过的引擎）。

**DeepSeek（不需要 Vercel AI Gateway 绑卡）**

```bash
REVIEW_ENGINE=deepseek
DEEPSEEK_API_KEY=...
# 可选
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

`GET /api/health` 的 `deepseek: true` 只表示密钥已配置。`reviewEngine` / `ran:` 为 `deepseek` 时才表示这次走的是 DeepSeek，不会写成 `bedrock` 或 `ai_gateway`。

**Bedrock（显式，或 auto 且凭证齐全）**

```bash
REVIEW_ENGINE=bedrock   # 或留空并满足下面三项，且不要同时配置 Gateway（auto 会优先 Gateway）
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

**AI Gateway（标成 `ai_gateway`，不是 Bedrock）**

```bash
# 留空 REVIEW_ENGINE 即会优先走 Gateway；也可以写明：
REVIEW_ENGINE=gateway
AI_GATEWAY_API_KEY=...
AI_GATEWAY_MODEL=amazon/nova-lite
```

**DynamoDB（`GET /api/health` 的 `dynamo: true` 仅表示将使用真客户端）**

```bash
ORDERS_TABLE_NAME=ordercheck-orders
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

只设置表名时 `dynamo` 仍为 `false`，`persistence` 为 `memory`。表内一条记录的 `pk` 是订单 id，`order` 属性是整单 JSON（邮件、事项、事实、外发）。不要另建消息表。SDK 读写失败会返回错误，不会悄悄改写内存并声称已持久化。工作台 DEMO 闭环仍保存在浏览器；Dynamo 接通后，「加载 DEMO-001」会额外 `POST /api/orders`。

**SES 入站**

```bash
AWS_REGION=us-east-1
RAW_EMAIL_BUCKET=...
INBOUND_DOMAIN=mail.example.com
INBOUND_WEBHOOK_SECRET=...
# 订单需已在当前存储里（内存或 Dynamo）
```

`POST /api/aws/inbound` 带 `Authorization: Bearer $INBOUND_WEBHOOK_SECRET`。收件会：规范化 Message-ID 并去重、只接受订单上的买方或卖方地址、把正文里重复出现的已有引用并入证据、按确定性状态机更新相关事项。未知发件人不会被当成买方。这不是公开造假接口。

**SES 真发信**

```bash
APP_MODE=aws
AWS_REGION=us-east-1
SES_FROM_ADDRESS=you@your-verified-domain
# 可选 SES_REPLY_TO_ADDRESS / SES_CONFIGURATION_SET
```

成功只记 `submit_succeeded` + MessageId。`delivered` / `bounce` / `complaint` 只能来自 `/api/aws/ses-events`。DEMO 模式始终 `recorded_not_sent`。

页面徽章与 `GET /api/config`、`GET /api/health` 会显示 `DEMO_MODE` / `AWS_MODE`、`reviewEngine`、`reviewEngineSelection`（`explicit` / `auto`）、`liveEngine`、`persistence`、`sesLive`。`dynamo: true` 只表示凭证和表名齐全、仓库会走 DynamoDB，不表示某次读写已经成功。`bedrock` / `gateway` 同样是配置是否具备，不是「这次调用成功」。

## 双引擎对比

工作台加载订单后点 **双引擎对比**，或：

```bash
curl -s -X POST http://127.0.0.1:43123/api/orders/DEMO-001/review-compare \
  -H 'content-type: application/json' \
  -d '{"order": { ... 当前订单 ... }}'
```

同一张订单会跑确定性引擎，并在 Gateway 或 Bedrock 可用时再跑 live。响应里左右两边各有事项列表和 `agreement`（共有 / 仅一边 / 状态不一致 / Jaccard）。live 未配置时 `live.available` 为 `false`，`live.missing` 列出缺少的环境变量名（不含值），`agreement.comparable` 为 `false`。live 调用失败时事项列表留空，**不会**把规则引擎的事项抄过去。对比不改写订单。

## 确定性引擎评测

夹具在 `lib/eval/fixtures.ts`（不少于 8 个场景：已约定数量不再追问、里程碑不一致、样品版本不一致、价格不完整、运费 / 付款 / 验收缺口，以及 DEMO-001 开场）。评分在 `lib/eval/score.ts`（清单通过率、micro precision / recall）。

```bash
npm run eval
# 等价于：npx vitest run lib/eval/score.test.ts
```

这只给确定性规则引擎打分，不会把分数说成 Bedrock 或 Gateway 的分数。

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
- `REVIEW_ENGINE` 留空时，若环境里有 Gateway 密钥会走 Gateway；没有 live 配置时仍是确定性规则引擎。显式 `REVIEW_ENGINE=deterministic` 保持 DEMO-001 本地闭环。

已实现（AWS 适配，需账号资源才运行时接通）：

- **DynamoDB** `DynamoOrderRepository`（表名 + 区域 + 凭证齐全时；否则内存）。
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
2. **Health:** `GET /api/health` — `mode`, `reviewEngine`, `reviewEngineSelection` (`auto` or `explicit`), `liveEngine`, `persistence`, booleans for `bedrock` / `ses` / `dynamo` / `s3` / `gateway` / `inbound`, plus `missing` (never secrets). `dynamo: true` only when table + region + credentials are set.
3. **Compare:** load DEMO-001 → **双引擎对比**. With no live key, the right panel says live unavailable and lists missing env names; the left panel is the deterministic issue set. With Gateway or Bedrock configured, both sides run and the agreement line shows shared / only-one-side issue ids. A live error does not relabel those issues as deterministic.
4. **Eval:** `npm run eval` scores the deterministic engine on `lib/eval/fixtures.ts` (quantity not re-asked, milestone, sample, price, shipping/payment). It does not claim a model score.
5. **Switch AWS path:** set vars from `.env.example`. Unset `REVIEW_ENGINE` prefers Gateway, then Bedrock when AWS credentials and model settings exist, else deterministic. Explicit `REVIEW_ENGINE` wins. Live failures stay labeled.
6. **Verify SES SDK path in code:** `lib/aws/ses.ts` constructs `SESClient` + `SendEmailCommand`. With `SES_FROM_ADDRESS` + `AWS_REGION` in AWS mode, send returns `submit_succeeded` + MessageId only — UI states this is **not** delivered.
7. **Request id screenshot:** with Bedrock or Gateway configured, run review; UI shows small text `引擎 … · request id …` (or gateway tokens) under 待确认事项, and the header badge `ran:` matches that engine. API also returns `meta` / `bedrockRequestId`.
8. **Inbound / events:** production should use SES→S3→Lambda → `handleInboundRecord`. Optional HTTPS forwarders require `Authorization: Bearer $INBOUND_WEBHOOK_SECRET` or `x-ordercheck-secret`. A buyer or seller reply is deduped, evidence quotes must sit inside the cited message, and only related issues change. Unknown senders are rejected. Delivery/bounce/complaint only via `/api/aws/ses-events`.
9. **Submission brief:** [docs/SUBMISSION.md](docs/SUBMISSION.md). Architecture honesty: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Real-call policy: [docs/adr/ADR-005-real-aws-calls-no-silent-fallback.md](docs/adr/ADR-005-real-aws-calls-no-silent-fallback.md).

## 接通说明（摘要）

1. 验证 SES 发信身份；测试收件人换成团队自己的地址。
2. 配好 Bedrock 模型权限；模型输出先做引用校验，再进入状态机。失败不回退规则引擎。
3. `lib/aws/ses.ts` 成功只能是 `submit_succeeded`；`delivered` 只能来自 SES 事件。
4. Dynamo 需要 `ORDERS_TABLE_NAME`、`AWS_REGION` 和访问密钥同时存在。失败不要写回内存再声称已保存。
5. 配置 `INBOUND_WEBHOOK_SECRET` 后才能用 HTTP 入站/事件转发；否则 501。

行为规则见 [docs/adr](docs/adr)。
