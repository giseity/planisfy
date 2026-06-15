import { OperationsProvider } from "@/components/operations/provider"

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return <OperationsProvider>{children}</OperationsProvider>
}
