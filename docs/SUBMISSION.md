# OrderCheck — AWS CDS Agentic AI Hackathon Submission

## Submission checklist

Use this as the Devpost / judge packet checklist.

- [x] **Public Git repo** with runnable Next.js app (`README.md`, `npm test`, `npm run build`)
- [x] **LICENSE** — MIT, Copyright 2026 `luyanqi` / OrderCheck Contributors (`LICENSE`)
- [x] **Architecture** — `docs/ARCHITECTURE.md` + deployable IaC in [`infra/`](../infra/) (SAM)
- [x] **CDS runtime evidence** — `docs/CDS_RUNTIME.md` + `lib/aws/sdk-surface.test.ts`
- [x] **Honest AI labeling** — `REVIEW_ENGINE` / `draftEngine`: `bedrock` | `ai_gateway` | `deterministic`
- [ ] **Demo video** — record workspace DEMO-001 loop + optional health/engine screenshot (attach on Devpost)
- [ ] **ACE / team profile** — complete on Devpost as required by the hackathon
- [x] **Deployed URL** — https://ordercheck-lurui1997s-projects.vercel.app (alias); `GET /api/health`
- [x] **Health** — `/api/health` exposes mode, `reviewEngine`, bedrock/ses/dynamo/s3/gateway/inbound flags, `missing[]`

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
| Bedrock Runtime Converse + tool | `lib/aws/bedrock.ts`, `lib/review/draft-model.ts` | When `REVIEW_ENGINE=bedrock` or AWS mode default + region/model |
| SES SendEmail | `lib/aws/ses.ts` | When `AWS_MODE` + `SES_FROM_ADDRESS` + `AWS_REGION` |
| SES inbound via S3 | `lib/aws/inbound.ts` + `infra/` | Lambda or `POST /api/aws/inbound` with secret |
| SES delivery events | `lib/aws/ses-events.ts` + `infra/` | `POST /api/aws/ses-events` with secret |
| DynamoDB | `lib/aws/repository.ts` + `infra/OrdersTable` | When `ORDERS_TABLE_NAME` set in AWS mode |
| AI Gateway (non-CDS backup) | `lib/aws/gateway.ts` | When `REVIEW_ENGINE=gateway` + API key |

## How to demo (judges)

1. Open the production URL → load **DEMO-001** → **开始核对** (deterministic or Gateway
   depending on env) → inspect quote-backed issues.
2. Call `GET /api/health` — see `reviewEngine`, `bedrock`/`ses`/`dynamo`/`s3`/`gateway`/
   `inbound` booleans and `missing` list (no secrets).
3. With Gateway or Bedrock configured: review again and screenshot the UI line
   **引擎 + request id / tokens** under 待确认事项; generate confirmation email and
   note `draftEngine` under the draft modal when a model path was used.
4. Code walk: `lib/aws/ses.ts` `SendEmailCommand`, `lib/aws/bedrock.ts` `ConverseCommand`,
   `DynamoOrderRepository` `GetCommand`/`PutCommand`, inbound `GetObjectCommand`,
   plus `infra/template.yaml` for the mail pipeline.
5. Optional AWS account: `sam deploy` from `infra/` (see infra README), set Vercel env
   from stack outputs; send via UI (expect `submit_succeeded` only); feed SNS Delivery
   to `/api/aws/ses-events` for honest `delivered`.

## What’s live vs stub

**Live in this deploy (typical Vercel demo):** deterministic DEMO-001 loop; AI Gateway
review when env keys are set; health/config APIs; all adapter **source code** with
real AWS SDK imports; SAM IaC under `infra/` for judges to review without deploying.

**Needs your AWS account resources:** Bedrock model access + IAM, verified SES identity
and configuration set, DynamoDB table, S3 raw-mail bucket + receipt rule, inbound
webhook secret / Lambda. Without them, APIs return explicit 501/502 — they do **not**
fake delivery or Bedrock labels. Draft LLM failures fall back to deterministic
`buildDraft` with `draftEngine: deterministic`.

**Out of scope / future:** WhatsApp/SMS / Amazon End User Messaging multi-channel
(one-line mention in `infra/README.md` only); full Amazon Bedrock AgentCore rewrite
(possible evolution, not required for this entry).

## Well-architected notes

- No secrets in git; credential chain / Vercel env only.
- Evidence quotes must be message substrings; invalid model citations are dropped.
- Delivery status is event-sourced; Send ≠ Delivered.
- Protected inbound webhooks; public message API cannot forge `ses_inbound`.
- MIT license at repo root.
