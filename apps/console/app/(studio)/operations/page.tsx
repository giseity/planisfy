import { consoleMetadata } from "../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Operations",
  description: "Monitor Planisfy services, jobs, releases, and alerts.",
  path: "/operations",
});

export default function Page() {
  return <ClientPage />
}
