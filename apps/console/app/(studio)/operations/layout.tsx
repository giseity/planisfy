import { OperationsProvider } from "@/components/studio/operations-provider"

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return <OperationsProvider>{children}</OperationsProvider>
}
