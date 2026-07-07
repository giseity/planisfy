import { consoleMetadata } from "../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Reset Password",
  description: "Recover access to your Planisfy Console account.",
  path: "/reset-password",
});

export default function Page() {
  return <ClientPage />
}
