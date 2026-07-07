import { consoleMetadata } from "../../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Schedules",
  description: "Review scheduled operational commands and recurring jobs.",
  path: "/operations/schedules",
});

export default function Page() {
  return <ClientPage />
}
