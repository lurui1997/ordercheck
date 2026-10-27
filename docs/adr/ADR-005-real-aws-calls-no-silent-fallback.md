# ADR-005: Real AWS / Gateway calls with honest status — no silent fallback

- Status: Accepted
- Date: 2026-10-25
- Supersedes (in part): ADR-002 implementation notes for “not yet wired” adapters

## Context

Hackathon judges score live CDS usage (SES, Bedrock, DynamoDB, S3) and observability.
ADR-002 kept sample mode first and forbade fake message ids. Adapters for Bedrock Converse
and SES SendEmail are now implemented. Remaining risk: silent fallback to the rule engine,
or writing `delivered` without an SES event, would look like integration while lying.

## Decision

1. **Engine selection is explicit.** `REVIEW_ENGINE=auto` (or empty) chooses the
   first configured engine in this order: `deepseek` → `ollama` → `ai_gateway` →
   `deterministic`. Bedrock is **not** on that list. `REVIEW_ENGINE=bedrock` is the
   only way to call Bedrock, including in AWS mode. If DeepSeek, Ollama, Bedrock, or
   Gateway is selected and misconfigured or the call fails, return that engine's
   error. Never substitute deterministic results under another engine's label.

2. **SES honesty.** `submitEmail` success → `submit_succeeded` + MessageId only.
   `delivered` / `bounce` / `complaint` come only from `POST /api/aws/ses-events`
   (or in-process `applySesEventPayload`) fed by SNS/SES events. Send API never writes
   `delivered`.

3. **Inbound is not a public forge.** Prefer SES → S3 → Lambda calling
   `handleInboundRecord`, or an OSS MTA posting raw MIME to `POST /api/inbound/email`
   (label `email_inbound`, not `ses_inbound`). Both HTTP entry points require
   `INBOUND_WEBHOOK_SECRET`. Without the secret → 501. Browser/API message routes still
   reject `source: ses_inbound` and `source: email_inbound`.

4. **Persistence.** `DATABASE_URL` selects Postgres. `PERSISTENCE=sqlite` selects the
   SQLite file. DynamoDB remains the legacy AWS path when `ORDERS_TABLE_NAME` is set
   in AWS mode and neither Postgres nor SQLite was selected. Failures surface; no
   silent Memory write pretending durability. SMTP is the default live mail path
   when `SMTP_HOST` and `SMTP_FROM` are set; SES remains optional. Success is still
   `submit_succeeded`, never an invented `delivered`.

5. **Observability.** Review responses and `order.review_meta` carry `engine`,
   `bedrockRequestId` and/or gateway usage. `GET /api/health` exposes config booleans
   and `missing` names — never secrets.

## Consequences

- Demo path remains one-click without AWS credentials.
- Judge path can flip `AWS_MODE` / `REVIEW_ENGINE` and show real SDK call sites in code
  plus request ids in the UI.
- Production still needs verified SES identities, receipt rules, and table/bucket IAM;
  code adapters are ready, account resources may not be.
