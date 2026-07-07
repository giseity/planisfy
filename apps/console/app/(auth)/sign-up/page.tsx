import { consoleMetadata } from "../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Sign Up",
  description: "Create a Planisfy Console account for map infrastructure workflows.",
  path: "/sign-up",
});

export default function Page() {
  return <ClientPage />
}
