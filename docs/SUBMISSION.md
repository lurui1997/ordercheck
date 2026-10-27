# OrderCheck — AWS CDS Agentic AI Hackathon Submission

## Submission checklist

Use this as the Devpost / judge packet checklist.

- [x] **Public Git repo** with runnable Next.js app (`README.md`, `npm test`, `npm run build`)
- [x] **LICENSE** — MIT, Copyright 2026 `luyanqi` / OrderCheck Contributors (`LICENSE`)
- [x] **Architecture** — `docs/ARCHITECTURE.md` + deployable IaC in [`infra/`](../infra/) (SAM)
- [x] **CDS runtime evidence** — `docs/CDS_RUNTIME.md` + `lib/aws/sdk-surface.test.ts`
- [x] **Honest AI labeling** — `REVIEW_ENGINE` / `draftEngine`: `deepseek` | `ollama` | `ai_gateway` | `deterministic` | `bedrock` (bedrock only when explicitly selected)
- [ ] **Demo video** — record workspace DEMO-001 loop + optional health/engine screenshot (attach on Devpost)
- [ ] **ACE / team profile** — complete on Devpost as required by the hackathon
- [x] **Deployed URL** — https://ordercheck-lurui1997s-projects.vercel.app (product intro); workspace at `/workspace`; `GET /api/health`
- [x] **Health** — `/api/health` exposes mode, `reviewEngine`, `reviewEngineSelection`, `liveEngine`, `persistence`, `objectStore`, bedrock/deepseek/ollama/ses/sesLive/smtp/dynamo/s3/gateway/inbound flags, `missing[]`. `dynamo: true` only when table + region + credentials are set. `deepseek: true` only when `DEEPSEEK_API_KEY` is set. `smtp: true` only when host and from are set.
- [x] **Compare** — `POST /api/orders/:id/review-compare` and the **双引擎对比** button. Live unavailable stays labeled. Auto live order is DeepSeek → Ollama → Gateway; Bedrock only when explicitly selected.
- [x] **Eval** — `npm run eval` scores `lib/eval/fixtures.ts` (≥8 cases) with checklist pass plus micro precision/recall. Deterministic engine only.

## Problem

Cross-border sellers often send a proforma invoice before buyer and seller have agreed
the same delivery milestone, sample revision, and packaging scope. Ambiguous email
threads look “done” while key terms remain unconfirmed. OrderCheck finds quote-backed
gaps, drafts an English confirmation email, and updates only related issues when a
reply arrives.

## Architecture (honest)

- **Demo path (default):** Next.js on Vercel, deterministic review engine, browser
  `localStorage`, outbound recorded as `recorded_not_sent`.
- **AWS / CDS path (adapters + IaC):** Amazon Bedrock Converse tool use (optional
  one-shot agent retry on evidence validation failure; optional LLM confirmation
  draft via `draftWithModel`), Amazon SES `SendEmail`, DynamoDB single-table order
  JSON, S3 GetObject for inbound MIME, protected webhooks for inbound + SES events.
  **Infrastructure as Code:** [`infra/template.yaml`](../infra/template.yaml) (AWS SAM)
  — SES receipt → S3 → Lambda forwarder, SES event SNS → Lambda, DynamoDB, IAM for
  Bedrock/SES/S3/DynamoDB. See [`infra/README.md`](../infra/README.md).
  Vercel AI Gateway is an explicit backup engine labeled `ai_gateway` — never
  presented as Bedrock.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for diagrams (implemented adapters vs
account-resource prerequisites). Runtime SDK map: [CDS_RUNTIME.md](./CDS_RUNTIME.md).

## CDS / AWS usage

| Service | Code | Runtime |
|---|---|---|
| Bedrock Runtime Converse + tool | `lib/aws/bedrock.ts`, `lib/review/draft-model.ts` | Only when `REVIEW_ENGINE=bedrock` plus region/model. Default auto path is DeepSeek → Ollama → gateway → deterministic ([OSS_RUNTIME.md](./OSS_RUNTIME.md)) |
| SES SendEmail | `lib/aws/ses.ts` | When `AWS_MODE` + `SES_FROM_ADDRESS` + `AWS_REGION` |
| SES inbound via S3 | `lib/aws/inbound.ts` + `infra/` | Lambda or `POST /api/aws/inbound` with secret. Buyer/seller replies merge evidence and advance only related issues |
| SES delivery events | `lib/aws/ses-events.ts` + `infra/` | `POST /api/aws/ses-events` with secret |
| DynamoDB | `lib/aws/repository.ts` + `infra/OrdersTable` | `dynamo: true` only with `ORDERS_TABLE_NAME` + `AWS_REGION` + credentials. Otherwise memory |
| AI Gateway (non-CDS backup) | `lib/aws/gateway.ts` | Auto after DeepSeek and Ollama, or explicit `REVIEW_ENGINE=gateway`. Labeled `ai_gateway` |
| DeepSeek (OpenAI-compatible, non-CDS) | `lib/deepseek.ts` | First auto choice when `DEEPSEEK_API_KEY` is set, or explicit `REVIEW_ENGINE=deepseek`. Labeled `deepseek` only. No silent deterministic draft fallback |
| Ollama (OpenAI-compatible, self-hosted) | `lib/oss/openai-compatible.ts` | Auto when DeepSeek is unset and `OLLAMA_MODEL` is set, or explicit `REVIEW_ENGINE=ollama`. Labeled `ollama` only |
| SMTP | `lib/oss/smtp.ts` | Preferred over SES when `SMTP_HOST` + `SMTP_FROM` are set. Success is `submit_succeeded` only |
| Postgres / SQLite | `lib/oss/postgres-repository.ts`, `lib/oss/sqlite-repository.ts` | `DATABASE_URL` or `PERSISTENCE=sqlite`. Both win over DynamoDB |

## How to demo (judges)

1. Open the production URL `/workspace` (the site root is the product intro) → load **DEMO-001** → **开始核对**. Header badges show
   `review:` (configured engine, `auto` or `explicit`) and, after a run, `ran:`
   (the engine that actually returned). Do not treat a config flag as a completed call.
   With no model keys this is the deterministic engine.
2. Click **双引擎对比**. If live is not configured, the right column says
   live unavailable and names the missing env vars; the left column is the
   deterministic issue set (milestone, sample, inserts, shipping/payment).
   Agreement stays `comparable: false` until a live call succeeds.
3. Call `GET /api/health` — `reviewEngine`, `reviewEngineSelection`, `liveEngine`,
   `persistence`, `objectStore`, `bedrock`/`deepseek`/`ollama`/`ses`/`sesLive`/`smtp`/`dynamo`/`s3`/`gateway`/`inbound`,
   and `missing` (no secrets). `dynamo: true` means the DynamoDB client is selected, not that a
   write has already succeeded. Auto order is DeepSeek → Ollama → Gateway → deterministic.
4. From a checkout, run `npm run eval`. It scores the deterministic engine on
   eight-plus fixtures (agreed quantity not re-asked, milestone mismatch, sample
   mismatch, incomplete price, shipping/payment/acceptance gaps).
5. With DeepSeek, Ollama, Gateway, or explicit Bedrock configured: review again and screenshot **引擎 + request id / tokens**
   under 待确认事项 and the `ran:` badge; generate confirmation email and note
   `draftEngine` under the draft modal when a model path was used. A failed live
   review is an error, not a silent rule-engine result.
6. Code walk: `lib/aws/ses.ts` `SendEmailCommand`, `lib/aws/bedrock.ts` `ConverseCommand`,
   `DynamoOrderRepository` `GetCommand`/`PutCommand`, inbound `GetObjectCommand`,
   plus `infra/template.yaml` for the mail pipeline.
7. Optional AWS account: `sam deploy` from `infra/` (see infra README), set Vercel env
   from stack outputs; send via UI (expect `submit_succeeded` only); feed SNS Delivery
   to `/api/aws/ses-events` for honest `delivered`.

## What’s live vs stub

**Live in this deploy (typical Vercel demo):** DEMO-001 loop. With `REVIEW_ENGINE`
unset, **开始核对** uses the first configured engine in this order: DeepSeek, Ollama,
AI Gateway, then the deterministic rule engine. The `ran:` badge names that engine.
Set `REVIEW_ENGINE=deterministic` to keep the offline rule engine. Bedrock is not
selected unless `REVIEW_ENGINE=bedrock`. Compare, health, and eval are in the repo.
Adapter **source** uses real AWS SDK imports; SAM IaC is under `infra/` for judges
who are not deploying. SMTP, MinIO, Postgres, and SQLite are the default self-hosted
path ([OSS_RUNTIME.md](./OSS_RUNTIME.md)).

**Needs your AWS account resources:** Bedrock model access + IAM, verified SES identity
and configuration set, DynamoDB table, S3 raw-mail bucket + receipt rule, inbound
webhook secret / Lambda. Without them, APIs return explicit 501/502 — they do **not**
fake delivery or Bedrock labels. DeepSeek draft failures return an error and do not
substitute `buildDraft`. Ollama, Gateway, and Bedrock draft failures fall back to
deterministic `buildDraft` with `draftEngine: deterministic`.

**Out of scope / future:** WhatsApp/SMS / Amazon End User Messaging multi-channel
(one-line mention in `infra/README.md` only); full Amazon Bedrock AgentCore rewrite
(possible evolution, not required for this entry).

## Well-architected notes

- No secrets in git; credential chain / Vercel env only.
- Evidence quotes must be message substrings; invalid model citations are dropped.
- Delivery status is event-sourced; Send ≠ Delivered.
- Protected inbound webhooks; public message API cannot forge `ses_inbound` or `email_inbound`.
- MIT license at repo root.
