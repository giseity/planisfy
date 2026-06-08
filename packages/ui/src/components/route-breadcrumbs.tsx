import * as React from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@planisfy/ui/components/breadcrumb"

export interface RouteBreadcrumbItem {
  label: string
  href?: string
}

function RouteBreadcrumbs({
  items,
  LinkComponent,
}: {
  items: RouteBreadcrumbItem[]
  LinkComponent?: React.ComponentType<{ href: string; children: React.ReactNode }>
}) {
  if (items.length === 0) return null
  const Link = LinkComponent

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <React.Fragment key={`${item.href ?? item.label}-${index}`}>
              <BreadcrumbItem>
                {item.href && !isLast ? (
                  Link ? (
                    <BreadcrumbLink asChild>
                      <Link href={item.href}>{item.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
                  )
                ) : (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export { RouteBreadcrumbs }
