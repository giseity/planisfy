import { consoleMetadata } from "../../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Basemap Operations",
  description: "Monitor basemap build and release workflows.",
  path: "/operations/basemaps",
});

export default function Page() {
  return <ClientPage />
}
