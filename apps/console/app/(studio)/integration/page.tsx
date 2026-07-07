import { consoleMetadata } from "../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Integration",
  description: "Track setup progress for API keys, published styles, and tilesets.",
  path: "/integration",
});

export default function Page() {
  return <ClientPage />
}
