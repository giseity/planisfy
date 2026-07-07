import { consoleMetadata } from "../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Onboarding",
  description: "Configure the first workspace and local setup for Planisfy Console.",
  path: "/onboarding",
});

export default function Page() {
  return <ClientPage />
}
