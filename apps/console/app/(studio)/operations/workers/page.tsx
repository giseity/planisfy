import { consoleMetadata } from "../../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Workers",
  description: "Inspect worker nodes and external compute capacity.",
  path: "/operations/workers",
});

export default function Page() {
  return <ClientPage />
}
