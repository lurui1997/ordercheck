import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createDiskObjectStore, createS3ObjectStore, s3ClientConfig, safeObjectKey } from "@/lib/oss/object-store";

describe("object store", () => {
  it("builds a path-style MinIO client config and does not require AWS_REGION", () => {
    const config = s3ClientConfig({
      S3_ENDPOINT: "http://127.0.0.1:9000",
      S3_ACCESS_KEY: "ordercheck",
      S3_SECRET_KEY: "local-secret",
      S3_BUCKET: "ordercheck-mail",
      S3_FORCE_PATH_STYLE: "true",
    });
    expect(config).toMatchObject({
      endpoint: "http://127.0.0.1:9000",
      forcePathStyle: true,
      credentials: { accessKeyId: "ordercheck", secretAccessKey: "local-secret" },
    });
  });

  it("puts and gets through an injected S3-compatible client", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Body: { transformToString: async () => "raw-mime" } });
    const store = createS3ObjectStore({ kind: "minio", bucket: "ordercheck-mail", client: { send } });
    await store.put("inbound/DEMO-001/a.eml", "raw-mime");
    expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: "ordercheck-mail",
      Key: "inbound/DEMO-001/a.eml",
      Body: "raw-mime",
    });
    await expect(store.get("inbound/DEMO-001/a.eml")).resolves.toBe("raw-mime");
    expect(send.mock.calls[1][0]).toBeInstanceOf(GetObjectCommand);
  });

  it("round-trips raw MIME on local disk and rejects path traversal", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ordercheck-mail-"));
    const store = createDiskObjectStore(dir);
    await store.put("inbound/DEMO-001/msg.eml", "From: a@b.c\r\n\r\nHello");
    const file = await readFile(path.join(dir, "inbound/DEMO-001/msg.eml"), "utf8");
    expect(file).toContain("Hello");
    await expect(store.get("inbound/DEMO-001/msg.eml")).resolves.toContain("Hello");
    expect(() => safeObjectKey("../etc/passwd")).toThrow(/非法对象键/);
    await expect(store.put("../secret", "nope")).rejects.toThrow(/非法对象键/);
  });
});
