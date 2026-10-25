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

1. **Engine selection is explicit.** `REVIEW_ENGINE` or AWS-mode default chooses
   `bedrock` / `ai_gateway` / `deterministic`. If Bedrock or Gateway is selected and
   misconfigured or the SDK fails, return `bedrock_*` / `gateway_*` errors. Never
   substitute deterministic results under a Bedrock or Gateway label.

2. **SES honesty.** `submitEmail` success → `submit_succeeded` + MessageId only.
   `delivered` / `bounce` / `complaint` come only from `POST /api/aws/ses-events`
   (or in-process `applySesEventPayload`) fed by SNS/SES events. Send API never writes
   `delivered`.

3. **Inbound is not a public forge.** Prefer SES → S3 → Lambda calling
   `handleInboundRecord`. Optional `POST /api/aws/inbound` requires
   `INBOUND_WEBHOOK_SECRET`. Without the secret → 501. Browser/API message routes still
   reject `source: ses_inbound`.

4. **Dynamo when configured.** `ORDERS_TABLE_NAME` selects `DynamoOrderRepository`
   (SDK Get/Put, pk=orderId). Failures surface; no silent Memory write pretending
   durability.

5. **Observability.** Review responses and `order.review_meta` carry `engine`,
   `bedrockRequestId` and/or gateway usage. `GET /api/health` exposes config booleans
   and `missing` names — never secrets.

## Consequences

- Demo path remains one-click without AWS credentials.
- Judge path can flip `AWS_MODE` / `REVIEW_ENGINE` and show real SDK call sites in code
  plus request ids in the UI.
- Production still needs verified SES identities, receipt rules, and table/bucket IAM;
  code adapters are ready, account resources may not be.
