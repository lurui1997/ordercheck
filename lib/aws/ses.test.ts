import { afterEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("@aws-sdk/client-ses", () => {
  class SESClient {
    send = send;
  }
  class SendEmailCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return { SESClient, SendEmailCommand };
});

import { MailNotReadyError, submitEmail } from "@/lib/aws/ses";

describe("submitEmail", () => {
  afterEach(() => {
    send.mockReset();
    delete process.env.AWS_REGION;
  });

  it("throws ses_not_configured without from/to", async () => {
    await expect(submitEmail({ from: "", to: "a@b.com", subject: "s", textBody: "b" })).rejects.toMatchObject({
      code: "ses_not_configured",
    });
  });

  it("throws ses_not_configured without region", async () => {
    await expect(
      submitEmail({ from: "from@example.com", to: "to@example.com", subject: "s", textBody: "b" }),
    ).rejects.toMatchObject({ code: "ses_not_configured" });
  });

  it("returns submit_succeeded with messageId on success", async () => {
    send.mockResolvedValue({ MessageId: "ses-msg-1" });
    const result = await submitEmail({
      from: "from@example.com",
      to: "to@example.com",
      subject: "Hello",
      textBody: "Body",
      region: "us-east-1",
    });
    expect(result).toEqual({ messageId: "ses-msg-1", status: "submit_succeeded" });
  });

  it("maps send failures to ses_submit_failed", async () => {
    send.mockRejectedValue(new Error("MessageRejected"));
    await expect(
      submitEmail({
        from: "from@example.com",
        to: "to@example.com",
        subject: "Hello",
        textBody: "Body",
        region: "us-east-1",
      }),
    ).rejects.toBeInstanceOf(MailNotReadyError);
    await expect(
      submitEmail({
        from: "from@example.com",
        to: "to@example.com",
        subject: "Hello",
        textBody: "Body",
        region: "us-east-1",
      }),
    ).rejects.toMatchObject({ code: "ses_submit_failed" });
  });
});
