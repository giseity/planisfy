import { consoleMetadata } from "../../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Workflow Templates",
  description: "Manage reusable operational workflow templates.",
  path: "/operations/templates",
});

export default function Page() {
  return <ClientPage />
}
