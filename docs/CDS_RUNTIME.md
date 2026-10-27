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
| `@aws-sdk/client-bedrock-runtime` | `lib/aws/bedrock.ts` | `reviewWithBedrock` | `BedrockRuntimeClient` + `ConverseCommand` (tool `submit_order_review`; optional 1 agent retry) | Only `REVIEW_ENGINE=bedrock`, with `AWS_REGION` + `BEDROCK_MODEL_ID`. `POST /api/orders/:id/review` and the live half of compare when that explicit engine is credentialed. `REVIEW_ENGINE=auto` never selects Bedrock. |
| `@aws-sdk/client-bedrock-runtime` | `lib/review/draft-model.ts` | `draftWithModel` → `draftWithBedrock` | `ConverseCommand` (tool `submit_confirmation_email_draft`) | Same Bedrock env; `POST /api/orders/:id/email-draft`. **On failure falls back to deterministic `buildDraft` and labels `draftEngine: deterministic` — never “bedrock”.** |
| `@aws-sdk/client-s3` | `lib/aws/inbound.ts` | `handleInboundRecord` | `S3Client` + `GetObjectCommand` | Inbound path with bucket/key; `POST /api/aws/inbound` or Lambda forwarder in `infra/` |
| `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` | `lib/aws/repository.ts` | `DynamoOrderRepository.get` / `.save` | `DynamoDBDocumentClient` + `GetCommand` / `PutCommand` | Only when `ORDERS_TABLE_NAME` + `AWS_REGION` + AWS credentials are all set and neither `DATABASE_URL` nor `PERSISTENCE=sqlite` is set (`health.dynamo === true`, `persistence: "dynamodb"`). Postgres and SQLite win. Otherwise memory. One item per order (`pk`, full JSON including messages and issues). |

## Non-CDS backup (honest label)

| Package | File | Label |
|---|---|---|
| `@ai-sdk/gateway` + `ai` | `lib/aws/gateway.ts`, `lib/review/draft-model.ts` | Engine / `draftEngine` = **`ai_gateway`** — never presented as Bedrock |
| `@ai-sdk/openai` chat completions + `ai` | `lib/deepseek.ts` | Engine / `draftEngine` = **`deepseek`**. OpenAI-compatible `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com/v1`). Never labeled bedrock, ollama, or ai_gateway. Draft failures throw; they do not substitute the deterministic template. |
| OpenAI-compatible chat completions | `lib/oss/openai-compatible.ts` | Engine / `draftEngine` = **`ollama`** when the call succeeds. Default base `http://127.0.0.1:11434/v1`. Review failures stay `ollama_*`. Draft failures fall back and label `draftEngine: deterministic`. |

## Route → adapter wiring

```
POST /api/orders/:id/review
  → lib/review/orchestrator.ts runReview
  → lib/deepseek.ts  OR  lib/oss/openai-compatible.ts  OR  lib/aws/gateway.ts  OR  lib/aws/bedrock.ts  OR  lib/review/engine.ts
  → repository.save (DynamoDB only when live; save errors are returned as persistence.ok=false)

POST /api/orders/:id/review-compare
  → lib/review/compare.ts compareReviews
  → deterministic reviewOrder AND, if configured, one live engine
  → does not save; live failure is not copied from the rule engine

POST /api/orders/:id/email-draft
  → lib/review/draft-model.ts draftWithModel
  → DeepSeek / Ollama / Bedrock / Gateway / deterministic buildDraft (+ draftEngine)
  → DeepSeek errors return 501/502 and do not include a deterministic draft

POST /api/orders/:id/send
  → lib/oss/smtp.ts          (SMTP when SMTP_HOST + SMTP_FROM; failure does not fall through to SES)
  → lib/aws/ses.ts submitEmail   (AWS live, only if SMTP is not configured)
  → or recordOutbound            (demo: recorded_not_sent)

POST /api/aws/inbound
  → lib/aws/inbound.ts handleInboundRecord → S3 GetObject → applyReply (source ses_inbound)

POST /api/inbound/email
  → lib/oss/inbound-mail.ts handleGenericInbound (source email_inbound; stores raw MIME when MinIO or disk is configured)

POST /api/aws/ses-events
  → lib/aws/ses-events.ts applySesEventPayload  (no SDK; updates delivery_status from events)
```

## How a judge verifies quickly

1. Open `package.json` → confirm `@aws-sdk/client-ses`, `client-bedrock-runtime`, `client-s3`, `client-dynamodb`, `lib-dynamodb`.
2. Open each file in the table above → search for `from "@aws-sdk/..."` and `client.send(`.
3. Run `npm test` → `lib/aws/sdk-surface.test.ts` must pass.
4. Call `GET /api/health` on the deployed URL. Field meanings:
   - `reviewEngine` / `reviewEngineSelection`: engine that **will** run. `auto` = DeepSeek, else Ollama, else gateway, else deterministic. Bedrock is never chosen by auto. `explicit` = `REVIEW_ENGINE` override. Not proof a call succeeded.
   - `liveEngine`: same preference for compare (DeepSeek, else Ollama, else gateway). Bedrock only when `REVIEW_ENGINE=bedrock` and credentials exist; otherwise `null`.
   - `bedrock` / `gateway` / `deepseek` / `ollama` / `ses` / `smtp` / `s3` / `inbound`: configuration present. `deepseek: true` means `DEEPSEEK_API_KEY` is set, not that a call succeeded. `smtp: true` means host and from are set. `sesLive` is the real SendEmail path.
   - `dynamo`: `true` only when the DynamoDB client will be used (table + region + credentials). `persistence` is `postgres`, `sqlite`, `dynamodb`, or `memory`. `objectStore` is `minio`, `s3`, `disk`, or `none`.
   - `missing`: AWS-mode env **names** still empty. Never values.
5. `npm run eval` — deterministic checklist, precision, and recall. Not a Bedrock score.
6. `POST /api/orders/:id/review-compare` — side-by-side issues. `live.available: false` lists missing config and does not call a model.
7. Optional: read `infra/template.yaml` for SES→S3→Lambda→app and DynamoDB/IAM definitions.

## Honesty rules (also ADR-005)

- SendEmail success ⇒ `submit_succeeded` only; **delivered** only from SES events.
- Bedrock/Gateway review failures ⇒ HTTP 501/502; **no** silent rule-engine results labeled as Bedrock. Compare keeps the failure on the live panel (`agreement.comparable: false`).
- Auto engine order is DeepSeek, then Ollama, then Gateway, then deterministic. Bedrock is not on that list. Explicit `REVIEW_ENGINE` wins. DeepSeek / Ollama / Gateway / Bedrock failures stay on that engine and are not relabeled.
- DeepSeek draft failures throw and do not substitute the deterministic template. Ollama, Gateway, and Bedrock draft failures fall back with `draftEngine: "deterministic"`.
