import { consoleMetadata } from "../../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Security Settings",
  description: "Manage account security settings for Planisfy Console.",
  path: "/settings/security",
});

export default function Page() {
  return <ClientPage />
}
