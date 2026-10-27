import { describe, expect, it, vi } from "vitest";
import { readSmtpSettings, SmtpError, submitSmtp } from "@/lib/oss/smtp";
import { recordOutbound, reviewOrder } from "@/lib/review/engine";
import { createOrderFromScenario } from "@/lib/scenario";

describe("SMTP adapter", () => {
  it("is unconfigured without host and from", () => {
    expect(readSmtpSettings({})).toBeNull();
    expect(readSmtpSettings({ SMTP_HOST: "127.0.0.1" })).toBeNull();
  });

  it("reads Mailpit-style settings without requiring a password", () => {
    expect(
      readSmtpSettings({
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "1025",
        SMTP_FROM: "seller@example.com",
      }),
    ).toMatchObject({
      host: "127.0.0.1",
      port: 1025,
      from: "seller@example.com",
      secure: false,
      user: undefined,
    });
  });

  it("returns submit_succeeded only when the transport provides a message id", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "<smtp-1@mailpit>" });
    const result = await submitSmtp(
      { to: "buyer@example.com", subject: "Confirm", textBody: "Please confirm." },
      {
        env: { SMTP_HOST: "127.0.0.1", SMTP_FROM: "seller@example.com" },
        transport: { sendMail },
      },
    );
    expect(result).toEqual({
      messageId: "smtp-1@mailpit",
      status: "submit_succeeded",
      from: "seller@example.com",
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "seller@example.com", to: "buyer@example.com" }),
    );
  });

  it("fails closed when SMTP accepts the socket but returns no message id", async () => {
    await expect(
      submitSmtp(
        { to: "buyer@example.com", subject: "Confirm", textBody: "Please confirm." },
        {
          env: { SMTP_HOST: "127.0.0.1", SMTP_FROM: "seller@example.com" },
          transport: { sendMail: async () => ({}) },
        },
      ),
    ).rejects.toMatchObject({ code: "smtp_submit_failed" });
  });

  it("does not throw a fake success when SMTP is missing", async () => {
    await expect(
      submitSmtp({ to: "buyer@example.com", subject: "Confirm", textBody: "Please confirm." }, { env: {} }),
    ).rejects.toBeInstanceOf(SmtpError);
  });

  it("records an SMTP submit as submit_succeeded and not as SES", () => {
    const reviewed = reviewOrder(createOrderFromScenario());
    if (!reviewed.ok) throw new Error(reviewed.error);
    const sent = recordOutbound(reviewed.order, {
      to: reviewed.order.buyer.email,
      subject: "Please confirm",
      body: "Could you confirm the open points?",
      issueIds: ["sample_version"],
      submit: { messageId: "smtp-9", from: "seller@example.com", provider: "smtp" },
    });
    if (!sent.ok) throw new Error(sent.error);
    expect(sent.order.outbound[0]).toMatchObject({
      delivery_status: "submit_succeeded",
      transport: "smtp",
      provider_message_id: "smtp-9",
    });
    expect(sent.order.outbound[0]?.note).toMatch(/SMTP/);
    expect(sent.order.outbound[0]?.note).not.toMatch(/Amazon SES/);
    expect(sent.order.outbound[0]?.note).toMatch(/不是已投递/);
  });
});
