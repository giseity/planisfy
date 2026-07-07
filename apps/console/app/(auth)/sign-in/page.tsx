import { consoleMetadata } from "../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Sign In",
  description: "Sign in to Planisfy Console to manage styles, tilesets, API keys, and usage.",
  path: "/sign-in",
});

export default function Page() {
  return <ClientPage />
}
