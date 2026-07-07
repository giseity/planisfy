import { consoleMetadata } from "../../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Processing Jobs",
  description: "Monitor processing jobs across Planisfy resources.",
  path: "/operations/jobs",
});

export default function Page() {
  return <ClientPage />
}
