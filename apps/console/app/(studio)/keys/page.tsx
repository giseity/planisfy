import { consoleMetadata } from "../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "API Keys",
  description: "Create, rotate, and scope Planisfy API keys.",
  path: "/keys",
});

export default function Page() {
  return <ClientPage />
}
