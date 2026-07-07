import { consoleMetadata } from "../../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Profile Settings",
  description: "Update your Planisfy Console profile details.",
  path: "/settings/profile",
});

export default function Page() {
  return <ClientPage />
}
