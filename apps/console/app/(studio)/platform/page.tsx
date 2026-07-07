import { consoleMetadata } from "../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Platform",
  description: "Inspect platform capabilities and deployment mode status.",
  path: "/platform",
});

export default function Page() {
  return <ClientPage />
}
