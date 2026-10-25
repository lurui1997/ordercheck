/**
 * SES → SNS → Lambda → OrderCheck delivery/bounce/complaint sink.
 * Maps to app handler: POST /api/aws/ses-events → lib/aws/ses-events.ts
 */
const APP_BASE_URL = process.env.APP_BASE_URL || "";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

export async function handler(event) {
  if (!APP_BASE_URL || !WEBHOOK_SECRET) {
    throw new Error("APP_BASE_URL and WEBHOOK_SECRET are required");
  }

  const results = [];
  for (const record of event.Records || []) {
    let payload;
    try {
      // SNS envelope: { Type, Message, ... } — app unwraps Message JSON
      payload = typeof record.Sns?.Message === "string"
        ? {
            Type: record.Sns.Type,
            Message: record.Sns.Message,
            TopicArn: record.Sns.TopicArn,
            MessageId: record.Sns.MessageId,
          }
        : record;
    } catch (error) {
      results.push({ status: "invalid", error: String(error) });
      continue;
    }

    const response = await fetch(`${APP_BASE_URL.replace(/\/$/, "")}/api/aws/ses-events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${WEBHOOK_SECRET}`,
        "x-ordercheck-secret": WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    results.push({ statusCode: response.status, body: text.slice(0, 500) });
    if (!response.ok) {
      console.error("ses-events forward failed", response.status, text);
    }
  }

  return { ok: true, results };
}
