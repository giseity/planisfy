import { consoleMetadata } from "../../../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Style Details",
  description: "Review metadata, versions, and publication settings for a Planisfy style.",
  path: "/styles",
});

export default function Page() {
  return <ClientPage />
}
