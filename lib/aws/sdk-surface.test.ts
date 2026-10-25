import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

/**
 * Static evidence that CDS AWS SDK clients remain wired at runtime call sites.
 * Guards against "docs-only" regressions that delete real imports.
 */
describe("AWS SDK surface (CDS runtime evidence)", () => {
  it("imports @aws-sdk/client-ses SendEmail in lib/aws/ses.ts", () => {
    const src = readSrc("lib/aws/ses.ts");
    expect(src).toMatch(/from\s+["']@aws-sdk\/client-ses["']/);
    expect(src).toMatch(/SendEmailCommand/);
    expect(src).toMatch(/new\s+SESClient/);
    expect(src).toMatch(/client\.send\(/);
  });

  it("imports @aws-sdk/client-bedrock-runtime Converse in lib/aws/bedrock.ts", () => {
    const src = readSrc("lib/aws/bedrock.ts");
    expect(src).toMatch(/from\s+["']@aws-sdk\/client-bedrock-runtime["']/);
    expect(src).toMatch(/ConverseCommand/);
    expect(src).toMatch(/BedrockRuntimeClient/);
    expect(src).toMatch(/client\.send\(/);
  });

  it("imports bedrock-runtime for optional draft path in lib/review/draft-model.ts", () => {
    const src = readSrc("lib/review/draft-model.ts");
    expect(src).toMatch(/from\s+["']@aws-sdk\/client-bedrock-runtime["']/);
    expect(src).toMatch(/ConverseCommand/);
  });

  it("imports @aws-sdk/client-s3 GetObject in lib/aws/inbound.ts", () => {
    const src = readSrc("lib/aws/inbound.ts");
    expect(src).toMatch(/from\s+["']@aws-sdk\/client-s3["']/);
    expect(src).toMatch(/GetObjectCommand/);
    expect(src).toMatch(/S3Client/);
    expect(src).toMatch(/client\.send\(/);
  });

  it("imports DynamoDB document client in lib/aws/repository.ts", () => {
    const src = readSrc("lib/aws/repository.ts");
    expect(src).toMatch(/from\s+["']@aws-sdk\/client-dynamodb["']/);
    expect(src).toMatch(/from\s+["']@aws-sdk\/lib-dynamodb["']/);
    expect(src).toMatch(/GetCommand/);
    expect(src).toMatch(/PutCommand/);
    expect(src).toMatch(/DynamoDBDocumentClient/);
  });

  it("package.json lists the CDS SDK dependencies", () => {
    const pkg = JSON.parse(readSrc("package.json")) as {
      dependencies: Record<string, string>;
    };
    for (const name of [
      "@aws-sdk/client-ses",
      "@aws-sdk/client-bedrock-runtime",
      "@aws-sdk/client-s3",
      "@aws-sdk/client-dynamodb",
      "@aws-sdk/lib-dynamodb",
    ]) {
      expect(pkg.dependencies[name], name).toBeTruthy();
    }
  });
});
