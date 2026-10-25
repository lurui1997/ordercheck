import { describe, expect, it } from "vitest";
import { requireInboundSecret } from "@/lib/aws/webhook-auth";

describe("requireInboundSecret", () => {
  it("returns 501 when secret unset", () => {
    const response = requireInboundSecret(new Request("http://localhost/api/aws/inbound"), {});
    expect(response?.status).toBe(501);
  });

  it("accepts Bearer and x-ordercheck-secret", () => {
    const env = { INBOUND_WEBHOOK_SECRET: "s3cret" };
    expect(
      requireInboundSecret(
        new Request("http://localhost", { headers: { Authorization: "Bearer s3cret" } }),
        env,
      ),
    ).toBeNull();
    expect(
      requireInboundSecret(
        new Request("http://localhost", { headers: { "x-ordercheck-secret": "s3cret" } }),
        env,
      ),
    ).toBeNull();
    expect(
      requireInboundSecret(
        new Request("http://localhost", { headers: { Authorization: "Bearer wrong" } }),
        env,
      )?.status,
    ).toBe(401);
  });
});
