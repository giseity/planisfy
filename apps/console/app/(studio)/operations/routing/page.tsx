import { consoleMetadata } from "../../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Routing Operations",
  description: "Monitor routing graph builds and runtime health.",
  path: "/operations/routing",
});

export default function Page() {
  return <ClientPage />
}
