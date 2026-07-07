import { consoleMetadata } from "../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Billing",
  description: "Manage Planisfy plan, invoices, and billing status.",
  path: "/billing",
});

export default function Page() {
  return <ClientPage />
}
