import { getRuntimeConfig } from "@/lib/aws/config";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ config: getRuntimeConfig() });
}
