import { consoleMetadata } from "../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Command Palette",
  description: "Quickly jump between Planisfy Console workflows and resources.",
  path: "/command-palette",
});

export default function Page() {
  return <ClientPage />
}
