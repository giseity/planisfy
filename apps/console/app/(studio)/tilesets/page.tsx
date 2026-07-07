import { consoleMetadata } from "../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Tilesets",
  description: "Import, process, and publish geospatial tilesets.",
  path: "/tilesets",
});

export default function Page() {
  return <ClientPage />
}
