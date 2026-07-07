import { consoleMetadata } from "../../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Environment",
  description: "Review deployment environment settings and runtime configuration.",
  path: "/platform/environment",
});

export default function Page() {
  return <ClientPage />
}
