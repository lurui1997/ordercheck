# OrderCheck

跨境订单漏项核对助手。卖方在发送订单确认或形式发票之前，用它检查这一张订单的往来邮件和报价，找出还没对齐的关键事项。

默认 **DEMO_MODE** 使用确定性规则引擎跑通样例闭环。推荐的自建栈是 **DeepSeek 或 Ollama**、**SMTP**、**MinIO**、**Postgres 或 SQLite**（见 [docs/OSS_RUNTIME.md](docs/OSS_RUNTIME.md)）。Amazon Bedrock / SES / DynamoDB / S3 仍是可选遗留路径，只在显式配置时调用。失败返回明确错误，**不会**把别的引擎标成 Bedrock，也**不会**把「提交成功」写成「已投递」。

产品说明见 [docs/PRD.md](docs/PRD.md)，结构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。开源运行时见 [docs/OSS_RUNTIME.md](docs/OSS_RUNTIME.md)。CDS 遗留对照见 [docs/CDS_RUNTIME.md](docs/CDS_RUNTIME.md)。AWS SAM 基础设施见 [infra/](infra/)。MIT 许可见 [LICENSE](LICENSE)。交接原文在 [docs/handoff](docs/handoff)。

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
5. 点击「生成确认邮件」，可以改正文，然后「确认记录发送」。没配 SMTP 时状态是未发送，页面写明没有调用 SMTP，也没有调用 SES。
6. 在「样例回放」里逐条播放：
   - 买方再次要求 v2：日期和内托仍未确认。
   - 卖方给出整套新条件：相关事项变成待买方接受。
   - 买方逐项接受：打开「查看约定摘要」。
7. 摘要把已确认和未确认分开，并写明履约尚未开始。可选再播放「含糊回复」或「确认后改口」。

样例邮箱是 `buyer@example.com` 和 `seller@example.com`，不能用于真实发信。回放不是 SES 收件。

## 环境变量

复制 `.env.example`。样例模式不需要填写云配置。自建栈的变量写在文件前半；AWS 变量在文件末尾，默认注释掉。

```bash
cp .env.example .env.local
```

本地可选依赖：

```bash
docker compose -f docker-compose.oss.yml up -d
```

这会拉起 MinIO、Mailpit（SMTP 捕获）和 Postgres。Ollama 需要自己在宿主机安装。账号口令只用于本机演示，见 compose 文件里的说明。

| 变量 | 说明 |
|---|---|
| `APP_MODE` / `AWS_MODE` | `demo`（默认）或 `aws` |
| `REVIEW_ENGINE` | `auto`（默认：deepseek → ollama → gateway → deterministic）/ `deepseek` / `ollama` / `gateway` / `deterministic` / `bedrock`。Bedrock 不会被 auto 选中 |
| `DEEPSEEK_API_KEY` | DeepSeek。可选 `DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com/v1`）、`DEEPSEEK_MODEL`（默认 `deepseek-chat`） |
| `OLLAMA_BASE_URL` | 默认 `http://127.0.0.1:11434/v1` |
| `OLLAMA_MODEL` | 有值才算 Ollama 已配置 |
| `AI_GATEWAY_API_KEY` | 可选备份。标签是 `ai_gateway` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP。Mailpit 常用端口 `1025`，可以不设用户名密码 |
| `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` / `S3_FORCE_PATH_STYLE` | MinIO 或其他 S3 兼容存储。MinIO 保持 `S3_FORCE_PATH_STYLE=true` |
| `MAIL_STORE` / `MAIL_DIR` | 不配 MinIO 时把原始 MIME 写到本地磁盘 |
| `DATABASE_URL` | Postgres。优先于 SQLite 和 DynamoDB |
| `PERSISTENCE` / `SQLITE_PATH` | `sqlite` 时用 `.data/orders.sqlite` |
| `INBOUND_WEBHOOK_SECRET` | 保护 `/api/aws/inbound`、`/api/inbound/email`、`/api/aws/ses-events` |
| `AWS_REGION` / `BEDROCK_MODEL_ID` / `SES_FROM_ADDRESS` / `ORDERS_TABLE_NAME` / `RAW_EMAIL_BUCKET` | 仅可选遗留 AWS 路径 |

不要把访问密钥写进仓库。

### 如何开启各引擎

**DeepSeek（推荐的远程模型）**

```bash
REVIEW_ENGINE=auto
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-chat
```

`reviewEngine` 为 `deepseek`。失败返回 `deepseek_*`，不会标成 bedrock，也不会改用规则引擎冒充。

**Ollama（本机开源模型）**

```bash
REVIEW_ENGINE=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
OLLAMA_MODEL=qwen2.5
```

**确定性规则引擎**

不设任何模型密钥，或 `REVIEW_ENGINE=deterministic`。DEMO-001 走这条路径。

**Bedrock（仅比赛可选路径）**

```bash
REVIEW_ENGINE=bedrock
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
```

**SMTP 真发信**

```bash
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_FROM=seller@localhost
```

成功只记 `submit_succeeded` + MessageId。没配 SMTP 时 DEMO 保持 `recorded_not_sent`。可选的 SES 路径仍是 `submit_succeeded`，`delivered` 只能来自 `/api/aws/ses-events`。

页面徽章与 `GET /api/health` 会显示 `DEMO_MODE` / `AWS_MODE`、`reviewEngine`、`smtp` 或 `ses`。

## 部署

应用在仓库根目录，框架是 Next.js。

- 在 Vercel 导入这个仓库，Framework Preset 选 Next.js，Root Directory 用仓库根。
- 不设置环境变量时就是 DEMO_MODE + deterministic，DEMO-001 可以完整走通。
- 要在线上用 DeepSeek / SMTP / Postgres，在部署环境变量里配置 `.env.example` 前半的项（不要提交到 Git）。Bedrock / SES 不是默认路径。
- 构建命令 `npm run build`，没有单独的输出目录需要手填。
- 演示状态保存在浏览器。未配置 `DATABASE_URL` 或 `PERSISTENCE=sqlite` 时，`/api/orders` 的进程内存储只供接口形状使用，新实例上是空的。

## 已实现、模拟、未实现

已实现：

- DEMO-001 加载、核对、证据定位、英文草稿、样例发送记录。
- 回复序列、含糊回复、确认后重开、人工决定和约定摘要。
- 引用必须出现在指定消息里。重复消息不会再次入账。
- DEMO_MODE / AWS_MODE 徽章、`reviewEngine` / `ses` 徽章、空状态和错误状态。
- **DeepSeek / Ollama** OpenAI 兼容核对（`engine: "deepseek"` 或 `"ollama"`）。
- **SMTP** 发信；成功仅 `submit_succeeded`。未配置时 DEMO 仍是 `recorded_not_sent`。
- **MinIO**（S3 兼容）或本地磁盘保存原始 MIME；**Postgres** 或 **SQLite** 保存订单。
- **Vercel AI Gateway** 备份路径（`engine: "ai_gateway"`）。
- **Amazon Bedrock / SES** 仍可显式开启；成功发信仅 `submit_succeeded`。非 Bedrock 不会标成 bedrock。
- `POST /api/orders/:id/review` 返回真实 `engine` 值。
- `POST /api/inbound/email` 接受原始 MIME 或解析后的正文（`email_inbound`）。

模拟：

- DEMO 发送只记在订单里，投递状态是 `recorded_not_sent`。
- 样例回放和手工粘贴代替收件，来源标签分别是样例和手工录入。
- DEMO 默认核对是确定性规则引擎（可显式切到 deepseek / ollama / gateway / bedrock）。

已实现（AWS 适配，可选遗留，需账号资源才运行时接通）：

- **DynamoDB** `DynamoOrderRepository`。有 `DATABASE_URL` 或 `PERSISTENCE=sqlite` 时不会选它。
- **SES 入站** `handleInboundRecord`（S3 GetObject + MIME 解析 + `ses_inbound` + 去重）。
- **受保护** `POST /api/aws/inbound`、`POST /api/inbound/email`、`POST /api/aws/ses-events`（`INBOUND_WEBHOOK_SECRET`）。
- **Bedrock agent 重试**（`BEDROCK_AGENT_RETRY=1`）与 `review_meta` / request id。只在 `REVIEW_ENGINE=bedrock` 时运行。
- **`GET /api/health`** 诊断布尔值，含 `smtp`、`persistence`、`objectStore`、`deepseek`、`ollama`。

未实现 / 后续：

- PDF、图片附件分析；WhatsApp / SMS 多渠道（见 [docs/SUBMISSION.md](docs/SUBMISSION.md)）。
- 完整 AgentCore 重写（可演进，非本版范围）。

## Hackathon judge path

English checklist for evaluators:

1. **Demo without AWS:** open the site → Load DEMO-001 → Start review → quote-backed issues → draft email → recorded send (`recorded_not_sent`) → scripted replies → agreement summary.
2. **Health:** `GET /api/health` — `mode`, `reviewEngine`, booleans for `bedrock` / `deepseek` / `ollama` / `ses` / `sesLive` / `smtp` / `dynamo` / `s3` / `gateway` / `inbound`, plus `persistence`, `objectStore`, and `missing` (never secrets).
3. **Default OSS path:** `REVIEW_ENGINE=auto` picks deepseek, then ollama, then gateway, then deterministic. It does **not** pick Bedrock. Set `REVIEW_ENGINE=bedrock` only for the optional contest path.
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
