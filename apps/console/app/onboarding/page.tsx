import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@planisfy/ui/components/card"
import { Input } from "@planisfy/ui/components/input"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Database,
  HardDrive,
  Mail,
  Plug,
  Server,
  Shield,
} from "lucide-react"
import type { ReactNode } from "react"

const steps = [
  { label: "Database", status: "complete", icon: Database },
  { label: "Services", status: "complete", icon: Server },
  { label: "Storage", status: "current", icon: HardDrive },
  { label: "Auth", status: "upcoming", icon: Shield },
  { label: "Email", status: "upcoming", icon: Mail },
  { label: "Review", status: "upcoming", icon: CheckCircle2 },
]

export default function OnboardingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-3xl space-y-7">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
            P
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Setup your Planisfy instance</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Configure the core services for your self-hosted deployment.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-6">
          {steps.map((step, index) => (
            <div key={step.label} className="flex flex-col items-center gap-2 text-center">
              <div
                className={
                  step.status === "complete"
                    ? "flex h-9 w-9 items-center justify-center rounded-full bg-success text-success-foreground"
                    : step.status === "current"
                      ? "flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      : "flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
                }
              >
                {step.status === "complete" ? <Check className="h-4 w-4" /> : index + 1}
              </div>
              <span className="text-xs text-muted-foreground">{step.label}</span>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <HardDrive className="h-5 w-5 text-muted-foreground" />
              </span>
              Object Storage
              <Badge variant="secondary">Step 3 of 6</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Provider">
              <Input readOnly value="Cloudflare R2" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Account ID">
                <Input placeholder="Your R2 account ID" />
              </Field>
              <Field label="Tiles bucket">
                <Input defaultValue="planisfy-tiles" />
              </Field>
            </div>
            <Field label="Access Key ID">
              <Input placeholder="R2 access key" />
            </Field>
            <Field label="Secret Access Key">
              <Input type="password" placeholder="R2 secret access key" />
            </Field>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button variant="outline">
                <Plug className="h-4 w-4" />
                Test connection
              </Button>
              <span className="flex items-center gap-1 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                Connection successful
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between gap-3">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost">Skip for now</Button>
            <Button>
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </main>
  )
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}
