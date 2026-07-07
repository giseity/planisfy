import { consoleMetadata } from "../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Usage",
  description: "Track API usage, quota consumption, and endpoint activity.",
  path: "/usage",
});

export default function Page() {
  return <ClientPage />
}
