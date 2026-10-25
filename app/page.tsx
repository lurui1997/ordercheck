import { Workspace } from "@/components/workspace";
import { getRuntimeConfig } from "@/lib/aws/config";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <Workspace config={getRuntimeConfig()} />;
}
