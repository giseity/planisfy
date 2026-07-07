import { consoleMetadata } from "../../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Style Editor",
  description: "Edit and publish a Planisfy MapLibre style.",
  path: "/styles",
});

export default function Page() {
  return <ClientPage />
}
