import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { resolveObjectStore } from "@/lib/aws/config";
import type { ObjectStoreKind } from "@/lib/types";

type EnvLike = Record<string, string | undefined>;

export interface ObjectStore {
  kind: Exclude<ObjectStoreKind, "none">;
  put(key: string, body: string): Promise<void>;
  get(key: string): Promise<string>;
}

export function safeObjectKey(key: string): string {
  const cleaned = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.split("/").some((part) => part === ".." || part === "")) {
    throw new Error("非法对象键。");
  }
  return cleaned;
}

export function s3ClientConfig(env: EnvLike, regionOverride?: string): S3ClientConfig {
  const endpoint = env.S3_ENDPOINT?.trim();
  if (endpoint) {
    const accessKeyId = env.S3_ACCESS_KEY?.trim() || env.AWS_ACCESS_KEY_ID?.trim() || "";
    const secretAccessKey = env.S3_SECRET_KEY?.trim() || env.AWS_SECRET_ACCESS_KEY?.trim() || "";
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("S3 兼容存储缺少 S3_ACCESS_KEY 或 S3_SECRET_KEY。");
    }
    const region = regionOverride || env.S3_REGION?.trim() || env.AWS_REGION?.trim() || "us-east-1";
    const forcePathStyle = (env.S3_FORCE_PATH_STYLE ?? "true").trim().toLowerCase() !== "false";
    return {
      region,
      endpoint,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    };
  }

  const region = regionOverride || env.AWS_REGION?.trim();
  if (!region) {
    throw new Error("缺少 AWS_REGION，无法访问 Amazon S3。");
  }
  return { region };
}

export function createS3Client(env: EnvLike, regionOverride?: string): S3Client {
  return new S3Client(s3ClientConfig(env, regionOverride));
}

async function streamToString(body: unknown): Promise<string> {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (typeof (body as { transformToString?: () => Promise<string> }).transformToString === "function") {
    return (body as { transformToString: () => Promise<string> }).transformToString();
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | string | Buffer>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface S3Sender {
  send(command: unknown): Promise<{ Body?: unknown }>;
}

export function createS3ObjectStore(input: {
  kind: "minio" | "s3";
  bucket: string;
  client: S3Sender;
}): ObjectStore {
  return {
    kind: input.kind,
    async put(key, body) {
      const Key = safeObjectKey(key);
      await input.client.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key,
          Body: body,
          ContentType: "message/rfc822",
        }),
      );
    },
    async get(key) {
      const Key = safeObjectKey(key);
      const response = await input.client.send(
        new GetObjectCommand({
          Bucket: input.bucket,
          Key,
        }),
      );
      return streamToString(response.Body);
    },
  };
}

export function mailDir(env: EnvLike): string {
  return path.resolve(env.MAIL_DIR?.trim() || ".data/mail");
}

export function createDiskObjectStore(dir: string): ObjectStore {
  const root = path.resolve(dir);
  return {
    kind: "disk",
    async put(key, body) {
      const relative = safeObjectKey(key);
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep) && file !== root) {
        throw new Error("非法对象键。");
      }
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body, "utf8");
    },
    async get(key) {
      const relative = safeObjectKey(key);
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep) && file !== root) {
        throw new Error("非法对象键。");
      }
      return readFile(file, "utf8");
    },
  };
}

export function createObjectStore(
  env: EnvLike = process.env,
  options: { client?: S3Sender; region?: string } = {},
): ObjectStore | null {
  const kind = resolveObjectStore(env);
  if (kind === "none") return null;
  if (kind === "disk") return createDiskObjectStore(mailDir(env));

  const bucket = (kind === "minio" ? env.S3_BUCKET?.trim() || env.RAW_EMAIL_BUCKET?.trim() : env.RAW_EMAIL_BUCKET?.trim()) || "";
  if (!bucket) return null;
  const client = options.client ?? createS3Client(env, options.region);
  return createS3ObjectStore({ kind, bucket, client });
}
