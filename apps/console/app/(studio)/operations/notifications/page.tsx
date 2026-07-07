import { consoleMetadata } from "../../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Notifications",
  description: "Configure operational notification channels and routing.",
  path: "/operations/notifications",
});

export default function Page() {
  return <ClientPage />
}
