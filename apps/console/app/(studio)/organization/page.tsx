import { consoleMetadata } from "../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Organization",
  description: "Manage organization profile, usage, and account details.",
  path: "/organization",
});

export default function Page() {
  return <ClientPage />
}
