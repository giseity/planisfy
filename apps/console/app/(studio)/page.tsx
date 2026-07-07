import { consoleMetadata } from "../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Dashboard",
  description: "Monitor Planisfy usage, service health, recent jobs, and setup readiness.",
  path: "/",
});

export default function Page() {
  return <ClientPage />
}
