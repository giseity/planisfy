import { consoleMetadata } from "../../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Backup Operations",
  description: "Review artifact backup status for Planisfy operations.",
  path: "/operations/backups",
});

export default function Page() {
  return <ClientPage />
}
