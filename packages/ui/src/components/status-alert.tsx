import * as React from "react"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@planisfy/ui/components/alert"

function StatusAlert({
  title,
  description,
  action,
  variant = "default",
  icon,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  variant?: React.ComponentProps<typeof Alert>["variant"]
  icon?: React.ReactNode
}) {
  return (
    <Alert variant={variant}>
      {icon}
      <AlertTitle>{title}</AlertTitle>
      {description && <AlertDescription>{description}</AlertDescription>}
      {action && <AlertAction>{action}</AlertAction>}
    </Alert>
  )
}

export { StatusAlert }
