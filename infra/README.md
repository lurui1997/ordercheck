# OrderCheck AWS infrastructure (SAM)

Judge-readable **Infrastructure as Code** for the minimal CDS mail + storage path.
You do **not** need to run `sam deploy` to evaluate the architecture — open
`template.yaml` and this README. Deploying requires a verified SES domain and is
optional for the hackathon demo (the Next.js app already contains the AWS SDK
adapters).

## What this stack defines

| Resource | Purpose | App mapping |
|---|---|---|
| `OrdersTable` (DynamoDB) | Single-table order JSON (`pk` = order id) | `ORDERS_TABLE_NAME` → `lib/aws/repository.ts` |
| `RawEmailBucket` (S3) | Encrypted raw MIME; public access blocked | `RAW_EMAIL_BUCKET` → `GetObject` in `lib/aws/inbound.ts` |
| `ReceiptRuleSet` + `InboundReceiptRule` | SES receipt → S3 `inbound/` prefix | Conceptual inbound; domain MX out-of-band |
| `InboundForwarderFunction` | S3 ObjectCreated → `POST /api/aws/inbound` | `app/api/aws/inbound/route.ts` |
| `SesConfigurationSet` + SNS + `SesEventsForwarderFunction` | Delivery/bounce/complaint → `POST /api/aws/ses-events` | `app/api/aws/ses-events/route.ts` |
| `OrderCheckAppRole` | IAM: Bedrock `InvokeModel`/`Converse`, SES `SendEmail`, S3 `GetObject`, DynamoDB CRUD | Credentials for Vercel / runtime |

WhatsApp / SMS multi-channel (Amazon End User Messaging) is **out of scope** for
this entry — possible future EUM extension only.

## Parameters

| Parameter | Maps to |
|---|---|
| `Domain` | `INBOUND_DOMAIN` |
| `FromAddress` | `SES_FROM_ADDRESS` (must be SES-verified) |
| `AppBaseUrl` | Deployed OrderCheck URL (no trailing slash) |
| `WebhookSecret` | `INBOUND_WEBHOOK_SECRET` (Bearer / `x-ordercheck-secret`) |
| `BedrockModelId` | Hint for `BEDROCK_MODEL_ID` |
| `ProjectName` | Resource name prefix (default `ordercheck`) |

## How to deploy (optional)

Prerequisites: AWS CLI + [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html),
SES domain identity verified, MX pointed at SES for inbound.

```bash
cd infra
sam validate --lint
sam build
sam deploy --guided \
  --parameter-overrides \
    Domain=mail.example.com \
    FromAddress=orders@mail.example.com \
    AppBaseUrl=https://YOUR-VERCEL-URL \
    WebhookSecret='long-random-secret' \
    BedrockModelId=amazon.nova-lite-v1:0
```

After deploy:

1. Activate the receipt rule set (SES allows one active set per region):

   ```bash
   aws ses set-active-receipt-rule-set --rule-set-name ordercheck-inbound
   ```

2. Copy stack **Outputs** into Vercel project env (Production):

   | Output | Vercel env |
   |---|---|
   | `OrdersTableName` | `ORDERS_TABLE_NAME` |
   | `RawEmailBucketName` | `RAW_EMAIL_BUCKET` |
   | `SesFromAddress` | `SES_FROM_ADDRESS` |
   | `InboundDomain` | `INBOUND_DOMAIN` |
   | `SesConfigurationSetName` | `SES_CONFIGURATION_SET` |
   | (parameter) `WebhookSecret` | `INBOUND_WEBHOOK_SECRET` |
   | (parameter) `BedrockModelId` | `BEDROCK_MODEL_ID` |
   | region | `AWS_REGION` |

3. Give the Vercel runtime credentials that can assume `AppRuntimeRoleArn`
   (or attach the same policy statements). **Do not commit access keys.**

4. Set `AWS_MODE=true` (or `APP_MODE=aws`) and `REVIEW_ENGINE=bedrock` when ready
   for live Bedrock. Demo deploys can keep `APP_MODE=demo` and still show SDK
   source + this IaC.

## Correspondence to application code

```
SES receipt rule  →  S3 raw object
                 →  InboundForwarderFunction
                 →  POST /api/aws/inbound
                 →  lib/aws/inbound.ts  (S3 GetObject + applyReply)

SES SendEmail (app) → lib/aws/ses.ts
                 →  Configuration set events → SNS
                 →  SesEventsForwarderFunction
                 →  POST /api/aws/ses-events
                 →  lib/aws/ses-events.ts  (honest delivered/bounce/complaint)

DynamoDB OrdersTable ←→ lib/aws/repository.ts DynamoOrderRepository
Bedrock Converse     ←→ lib/aws/bedrock.ts (app runtime, not this Lambda)
```

Runtime SDK call sites are enumerated in [`docs/CDS_RUNTIME.md`](../docs/CDS_RUNTIME.md).

## Local review without deploy

```bash
# From repo root — no AWS account required
sed -n '1,120p' infra/template.yaml
cat infra/src/inbound_forwarder.mjs
cat infra/src/ses_events_forwarder.mjs
```

Judges should treat this folder as the **deployable definition** of the CDS mail
pipeline; the Vercel app remains the interactive demo surface.
