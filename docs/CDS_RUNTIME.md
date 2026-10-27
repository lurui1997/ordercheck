# CDS runtime evidence — AWS SDK call sites

The **default recommended stack is open source** (DeepSeek or Ollama, SMTP, MinIO, Postgres or SQLite). See [OSS_RUNTIME.md](./OSS_RUNTIME.md). Bedrock, SES, DynamoDB, and S3 stay in the tree as an **optional legacy path for the CDS contest**. They run only when you opt in (`REVIEW_ENGINE=bedrock`, `AWS_MODE` plus SES settings, `ORDERS_TABLE_NAME` without `DATABASE_URL`). `REVIEW_ENGINE=auto` never selects Bedrock.

Devpost / AWS CDS Agentic AI Hackathon entries **must demonstrate CDS at runtime**.
This document maps each required AWS SDK package to the **source file and function**
that constructs a client and issues a live API command. Adapters fail closed with
explicit errors when credentials or env are missing — they do **not** invent success.

Companion static guard: `lib/aws/sdk-surface.test.ts` (asserts these imports remain).

Deployable mail/storage wiring (optional `sam deploy`): [`infra/`](../infra/) —
see [`infra/README.md`](../infra/README.md).

## Package → runtime call map

| AWS SDK package | Runtime file | Entry | Command / API | When it runs |
|---|---|---|---|---|
| `@aws-sdk/client-ses` | `lib/aws/ses.ts` | `submitEmail` | `SESClient` + `SendEmailCommand` | `AWS_MODE` + `SES_FROM_ADDRESS` + `AWS_REGION`; called from `POST /api/orders/:id/send` |
| `@aws-sdk/client-bedrock-runtime` | `lib/aws/bedrock.ts` | `reviewWithBedrock` | `BedrockRuntimeClient` + `ConverseCommand` (tool `submit_order_review`; optional 1 agent retry) | Only `REVIEW_ENGINE=bedrock`, with `AWS_REGION` + `BEDROCK_MODEL_ID`; `POST /api/orders/:id/review` via `lib/review/orchestrator.ts`. Not the auto default. |
| `@aws-sdk/client-bedrock-runtime` | `lib/review/draft-model.ts` | `draftWithModel` → `draftWithBedrock` | `ConverseCommand` (tool `submit_confirmation_email_draft`) | Same Bedrock env; `POST /api/orders/:id/email-draft`. **On failure falls back to deterministic `buildDraft` and labels `draftEngine: deterministic` — never “bedrock”.** |
| `@aws-sdk/client-s3` | `lib/aws/inbound.ts` | `handleInboundRecord` | `S3Client` + `GetObjectCommand` | Inbound path with bucket/key; `POST /api/aws/inbound` or Lambda forwarder in `infra/` |
| `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` | `lib/aws/repository.ts` | `DynamoOrderRepository.get` / `.save` | `DynamoDBDocumentClient` + `GetCommand` / `PutCommand` | When `ORDERS_TABLE_NAME` (+ `AWS_REGION`) set; selected by `createOrderRepository()` |

## Non-CDS backup (honest label)

| Package | File | Label |
|---|---|---|
| `@ai-sdk/gateway` + `ai` | `lib/aws/gateway.ts`, `lib/review/draft-model.ts` | Engine / `draftEngine` = **`ai_gateway`** — never presented as Bedrock |

## Route → adapter wiring

```
POST /api/orders/:id/review
  → lib/review/orchestrator.ts runReview
  → lib/aws/bedrock.ts  OR  lib/aws/gateway.ts  OR  lib/review/engine.ts

POST /api/orders/:id/email-draft
  → lib/review/draft-model.ts draftWithModel
  → Bedrock / Gateway / deterministic buildDraft (+ draftEngine)

POST /api/orders/:id/send
  → lib/aws/ses.ts submitEmail   (AWS live)
  → or recordOutbound            (demo: recorded_not_sent)

POST /api/aws/inbound
  → lib/aws/inbound.ts handleInboundRecord → S3 GetObject → applyReply

POST /api/aws/ses-events
  → lib/aws/ses-events.ts applySesEventPayload  (no SDK; updates delivery_status from events)
```

## How a judge verifies quickly

1. Open `package.json` → confirm `@aws-sdk/client-ses`, `client-bedrock-runtime`, `client-s3`, `client-dynamodb`, `lib-dynamodb`.
2. Open each file in the table above → search for `from "@aws-sdk/..."` and `client.send(`.
3. Run `npm test` → `lib/aws/sdk-surface.test.ts` must pass.
4. Call `GET /api/health` on the deployed URL → see `reviewEngine` and capability booleans (no secrets).
5. Optional: read `infra/template.yaml` for SES→S3→Lambda→app and DynamoDB/IAM definitions.

## Honesty rules (also ADR-005)

- SendEmail success ⇒ `submit_succeeded` only; **delivered** only from SES events.
- Bedrock/Gateway review failures ⇒ HTTP 501/502; **no** silent rule-engine results labeled as Bedrock.
- Draft model failures ⇒ deterministic fallback with `draftEngine: "deterministic"`.
