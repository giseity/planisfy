import { consoleMetadata } from "../../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Tileset Details",
  description: "Review source data, processing status, and publication details for a tileset.",
  path: "/tilesets",
});

export default function Page() {
  return <ClientPage />
}
