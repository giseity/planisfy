import { OperationsProvider } from "@/features/operations/provider"

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return <OperationsProvider>{children}</OperationsProvider>
}
