# OSS runtime — default stack

OrderCheck 的默认推荐栈不依赖 AWS 账号。Amazon Bedrock、SES、DynamoDB、S3 仍留在代码里，只在显式配置时作为 CDS 比赛的可选遗留路径。对照表见 [CDS_RUNTIME.md](./CDS_RUNTIME.md)。

DEMO-001 在不填任何密钥时仍走确定性规则引擎，外发状态是 `recorded_not_sent`。

## 推荐映射

| 原来的 AWS 产品 | 开源 / 可自建替代 | 代码 | 何时启用 |
|---|---|---|---|
| Bedrock | DeepSeek（OpenAI 兼容） | `lib/deepseek.ts` | `DEEPSEEK_API_KEY`，或 `REVIEW_ENGINE=deepseek`。写入前会规范化枚举 |
| Bedrock | Ollama `/v1` | `lib/oss/openai-compatible.ts` | `OLLAMA_MODEL`（地址默认 `http://127.0.0.1:11434/v1`） |
| SES SendEmail | SMTP（Postal、Mailu、Haraka、docker-mailserver、Mailpit） | `lib/oss/smtp.ts` | `SMTP_HOST` + `SMTP_FROM` |
| S3 | MinIO 或其他 S3 兼容存储 | `lib/oss/object-store.ts` | `S3_ENDPOINT` + `S3_ACCESS_KEY` + `S3_SECRET_KEY` + `S3_BUCKET`，`S3_FORCE_PATH_STYLE=true` |
| S3 | 本地磁盘 | 同上 | `MAIL_STORE=disk` 或 `MAIL_DIR` |
| DynamoDB | Postgres | `lib/oss/postgres-repository.ts` | `DATABASE_URL` |
| DynamoDB | SQLite 文件 | `lib/oss/sqlite-repository.ts` | `PERSISTENCE=sqlite`（默认 `.data/orders.sqlite`） |

本地依赖草图：仓库根目录 `docker-compose.oss.yml`（MinIO + Mailpit + Postgres）。Ollama 装在宿主机即可。

## 引擎标签

`reviewEngine` / `draftEngine` / `review_meta.engine` 只使用真实调用的名字：

`deepseek` | `ollama` | `ai_gateway` | `deterministic` | `bedrock`

非 Bedrock 调用不会标成 `bedrock`。`REVIEW_ENGINE=auto` 或留空时的顺序是：

1. DeepSeek（有 `DEEPSEEK_API_KEY`）
2. Ollama（有 `OLLAMA_MODEL`）
3. AI Gateway（有 `AI_GATEWAY_API_KEY`）
4. 确定性规则引擎

Bedrock 不在这条链上。只有 `REVIEW_ENGINE=bedrock` 才会调用 `lib/aws/bedrock.ts`。选中的模型失败时返回对应的 `deepseek_*` / `ollama_*` / `bedrock_*` / `gateway_*` 错误，不会悄悄换成规则引擎再标成模型。

DeepSeek 草稿失败会抛错，不替换成确定性模板。Ollama、Gateway、Bedrock 的草稿失败会退回确定性模板，并把 `draftEngine` 标成 `deterministic`。

## 发信

配置了 SMTP 时，`POST /api/orders/:id/send` 走 Nodemailer。成功只表示 SMTP 服务器接受了消息：`delivery_status=submit_succeeded`，备注写明不是已投递。没有 MessageId 则失败，不编造成功。

没配 SMTP、也没开 SES 时，DEMO 仍是 `recorded_not_sent`。

`GET /api/health`：`smtp: true` 表示 `SMTP_HOST` 和 `SMTP_FROM` 已设置，不代表探测过服务器。`ses` / `sesLive` 仍反映可选的 AWS 路径。SMTP 已配置时优先于 SES，不会在 SMTP 失败后改走 SES。

## 存储与入站

- `persistence`：`postgres` | `sqlite` | `dynamodb` | `memory`
- `objectStore`：`minio` | `s3` | `disk` | `none`
- `POST /api/aws/inbound` 保留，给 SES → S3 → Lambda。
- `POST /api/inbound/email` 接受原始 MIME（`raw`）或解析后的 `text` / `subject` / `from` / `to` / `messageId` / `orderId`。来源标签是 `email_inbound`，不是 `ses_inbound`。
- 两个入站接口都要 `INBOUND_WEBHOOK_SECRET`（`Authorization: Bearer` 或 `x-ordercheck-secret`）。未配置返回 501。
- 对象存储已配置时先写入原始 MIME。写入失败则不入账。

页面和 `POST /api/orders/:id/messages` 不能伪造 `ses_inbound` 或 `email_inbound`。

## 健康检查

`GET /api/health` 只返回布尔和模式名，不返回密钥。除原有 `bedrock` / `ses` / `sesLive` / `dynamo` / `s3` / `gateway` / `inbound` 外，还包括：

- `deepseek`、`ollama`
- `smtp`
- `persistence`
- `objectStore`
- `reviewEngine`（`deepseek` | `ollama` | `ai_gateway` | `deterministic` | `bedrock`）
