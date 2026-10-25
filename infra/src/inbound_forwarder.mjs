/**
 * SES receipt → S3 ObjectCreated → forward metadata to OrderCheck.
 * Maps to app handler: POST /api/aws/inbound → lib/aws/inbound.ts handleInboundRecord
 */
import { createHash } from "node:crypto";

const APP_BASE_URL = process.env.APP_BASE_URL || "";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

export async function handler(event) {
  if (!APP_BASE_URL || !WEBHOOK_SECRET) {
    throw new Error("APP_BASE_URL and WEBHOOK_SECRET are required");
  }

  const results = [];
  for (const record of event.Records || []) {
    const bucket = record.s3?.bucket?.name;
    const key = decodeURIComponent((record.s3?.object?.key || "").replace(/\+/g, " "));
    if (!bucket || !key) {
      results.push({ status: "skipped", reason: "missing bucket/key" });
      continue;
    }

    // SES stores under prefix; messageId is typically the object key basename (sans .eml)
    const messageId =
      record.ses?.mail?.messageId ||
      key.split("/").pop()?.replace(/\.eml$/i, "") ||
      createHash("sha256").update(`${bucket}/${key}`).digest("hex").slice(0, 32);

    const recipients = record.ses?.receipt?.recipients || [];
    const body = JSON.stringify({ bucket, key, messageId, recipients });

    const response = await fetch(`${APP_BASE_URL.replace(/\/$/, "")}/api/aws/inbound`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${WEBHOOK_SECRET}`,
        "x-ordercheck-secret": WEBHOOK_SECRET,
      },
      body,
    });

    const text = await response.text();
    results.push({ statusCode: response.status, body: text.slice(0, 500), bucket, key, messageId });
    if (!response.ok) {
      console.error("inbound forward failed", response.status, text);
    }
  }

  return { ok: true, results };
}
