import nodemailer from "nodemailer";

export interface SmtpSettings {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  secure: boolean;
}

export interface SmtpSubmitInput {
  to: string;
  subject: string;
  textBody: string;
  from?: string;
  replyTo?: string;
}

export interface SmtpSubmitResult {
  messageId: string;
  status: "submit_succeeded";
  from: string;
}

export class SmtpError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

type EnvLike = Record<string, string | undefined>;

export function readSmtpSettings(env: EnvLike = process.env): SmtpSettings | null {
  const host = env.SMTP_HOST?.trim();
  const from = env.SMTP_FROM?.trim();
  if (!host || !from) return null;
  const portRaw = Number(env.SMTP_PORT?.trim() || "587");
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 587;
  const secure = env.SMTP_SECURE === "true" || port === 465;
  const user = env.SMTP_USER?.trim() || undefined;
  const pass = env.SMTP_PASS;
  return {
    host,
    port,
    user,
    pass: pass && pass.length > 0 ? pass : undefined,
    from,
    secure,
  };
}

export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    replyTo?: string;
  }): Promise<{ messageId?: string }>;
}

export function createSmtpTransport(settings: SmtpSettings): MailTransport {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.user ? { user: settings.user, pass: settings.pass ?? "" } : undefined,
  });
  return {
    sendMail: (message) => transport.sendMail(message),
  };
}

/**
 * SMTP submit. Success means the server accepted the message (submit_succeeded).
 * It is not delivery. Missing MessageId is a failure — never invent one.
 */
export async function submitSmtp(
  input: SmtpSubmitInput,
  options: { env?: EnvLike; transport?: MailTransport } = {},
): Promise<SmtpSubmitResult> {
  const settings = readSmtpSettings(options.env ?? process.env);
  if (!settings) {
    throw new SmtpError("smtp_not_configured", "缺少 SMTP_HOST 或 SMTP_FROM，没有发送邮件。");
  }
  if (!input.to.trim() || !input.subject.trim() || !input.textBody.trim()) {
    throw new SmtpError("smtp_not_configured", "收件人、主题或正文为空，没有发送邮件。");
  }

  const from = input.from?.trim() || settings.from;
  const transport = options.transport ?? createSmtpTransport(settings);

  let info: { messageId?: string };
  try {
    info = await transport.sendMail({
      from,
      to: input.to.trim(),
      subject: input.subject,
      text: input.textBody,
      replyTo: input.replyTo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMTP 发送失败。";
    throw new SmtpError("smtp_submit_failed", message);
  }

  const messageId = info.messageId?.replace(/^<|>$/g, "").trim();
  if (!messageId) {
    throw new SmtpError("smtp_submit_failed", "SMTP 服务器没有返回 MessageId。没有把结果记成已提交。");
  }

  return { messageId, status: "submit_succeeded", from };
}
