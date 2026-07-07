import { consoleMetadata } from "../../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = consoleMetadata({
  title: "Styles",
  description: "Create, edit, validate, and publish Planisfy map styles.",
  path: "/styles",
});

export default function Page() {
  return <ClientPage />
}
