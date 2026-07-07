import { consoleMetadata } from "../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Team",
  description: "Manage organization members, roles, and invitations.",
  path: "/team",
});

export default function Page() {
  return <ClientPage />
}
