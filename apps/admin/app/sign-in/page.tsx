import { adminMetadata } from "../../lib/metadata";
import ClientPage from "./client-page";

export const metadata = adminMetadata({
  title: "Sign In",
  description: "Sign in to the Planisfy Admin control plane.",
  path: "/sign-in",
});

export default function Page() {
  return <ClientPage />
}
