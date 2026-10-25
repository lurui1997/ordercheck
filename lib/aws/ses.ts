import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

export interface OutboundMail {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  textBody: string;
  configurationSet?: string;
  region?: string;
}

export interface SubmitResult {
  messageId: string;
  status: "submit_succeeded";
}

export class MailNotReadyError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * SES SendEmail. Success only means the API accepted the message (submit_succeeded).
 * Delivery status must come from a later SES event — never invent "delivered".
 */
export async function submitEmail(input: OutboundMail): Promise<SubmitResult> {
  if (!input.from || !input.to) {
    throw new MailNotReadyError("ses_not_configured", "缺少 SES_FROM_ADDRESS 或收件人，没有调用 SES。");
  }

  const region = input.region || process.env.AWS_REGION;
  if (!region) {
    throw new MailNotReadyError("ses_not_configured", "缺少 AWS_REGION，没有调用 SES。");
  }

  const client = new SESClient({ region });
  try {
    const response = await client.send(
      new SendEmailCommand({
        Source: input.from,
        Destination: { ToAddresses: [input.to] },
        ReplyToAddresses: input.replyTo ? [input.replyTo] : undefined,
        ConfigurationSetName: input.configurationSet || undefined,
        Message: {
          Subject: { Data: input.subject, Charset: "UTF-8" },
          Body: { Text: { Data: input.textBody, Charset: "UTF-8" } },
        },
      }),
    );
    if (!response.MessageId) {
      throw new MailNotReadyError("ses_submit_failed", "SES 接受了请求但没有返回 MessageId。");
    }
    return { messageId: response.MessageId, status: "submit_succeeded" };
  } catch (error) {
    if (error instanceof MailNotReadyError) throw error;
    const message = error instanceof Error ? error.message : "SES 发送失败。";
    throw new MailNotReadyError("ses_submit_failed", message);
  }
}
