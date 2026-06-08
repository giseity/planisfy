import * as React from "react"
import {
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyIcon,
  EmptyTitle,
} from "@planisfy/ui/components/empty"

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <Empty>
      {icon && <EmptyIcon>{icon}</EmptyIcon>}
      {title && <EmptyTitle>{title}</EmptyTitle>}
      {description && <EmptyDescription>{description}</EmptyDescription>}
      {action && <EmptyActions>{action}</EmptyActions>}
    </Empty>
  )
}

export { EmptyState }
