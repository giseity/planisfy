import { consoleMetadata } from "../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Verify Email",
  description: "Confirm your email address before continuing in Planisfy Console.",
  path: "/verify-email",
});

export default function Page() {
  return <ClientPage />
}
