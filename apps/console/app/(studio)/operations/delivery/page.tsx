import { consoleMetadata } from "../../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Delivery Operations",
  description: "Check delivery health for Planisfy map services.",
  path: "/operations/delivery",
});

export default function Page() {
  return <ClientPage />
}
