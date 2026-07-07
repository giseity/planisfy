import { adminMetadata } from "../../lib/metadata";

export const metadata = adminMetadata({
  title: "Workflow Templates",
  description: "Manage reusable workflow templates for platform jobs.",
  path: "/workflow-templates",
});

import { desc, isNull } from "drizzle-orm"
import { db, workflowTemplates } from "@planisfy/database"
import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@planisfy/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table"
import { requireAdmin } from "@/features/auth/admin-auth"
import {
  applyWorkflowTemplateAction,
  createWorkflowTemplateAction,
  deleteWorkflowTemplateAction,
} from "@/features/operations/ops-actions"
import { formatDate, shortId, truncate } from "@/features/operations/ops"

export const dynamic = "force-dynamic"

export default async function WorkflowTemplatesPage() {
  await requireAdmin()
  const templates = await db
    .select()
    .from(workflowTemplates)
    .where(isNull(workflowTemplates.deletedAt))
    .orderBy(desc(workflowTemplates.createdAt))
    .limit(100)

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-bold">Workflow Templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage custom account workflow templates from the admin boundary.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create custom template</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createWorkflowTemplateAction} className="grid gap-3 lg:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Account ID</span>
              <input
                name="accountId"
                required
                className="h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Name</span>
              <input
                name="name"
                required
                className="h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Category</span>
              <select
                name="category"
                defaultValue="schedule"
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="schedule">schedule</option>
                <option value="preview">preview</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Description</span>
              <input
                name="description"
                className="h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm lg:col-span-2">
              <span className="font-medium">Template JSON</span>
              <textarea
                name="template"
                required
                rows={7}
                defaultValue={'{\n  "kind": "source_import",\n  "cron": "0 2 * * *",\n  "payload": {}\n}'}
                className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              />
            </label>
            <div className="lg:col-span-2">
              <Button type="submit" size="sm">Create template</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="max-w-md">
                    <div className="font-medium text-sm">{template.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {shortId(template.id)} · {shortId(template.accountId)}
                    </div>
                    {template.description && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {truncate(template.description, 120)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>{template.category}</TableCell>
                  <TableCell>
                    <Badge variant={template.builtIn ? "secondary" : "outline"}>
                      {template.builtIn ? "built-in" : "custom"}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatDate(template.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {!template.builtIn && (
                        <form action={applyWorkflowTemplateAction}>
                          <input type="hidden" name="id" value={template.id} />
                          <Button type="submit" size="xs" variant="outline">Apply</Button>
                        </form>
                      )}
                      {!template.builtIn && (
                        <form action={deleteWorkflowTemplateAction}>
                          <input type="hidden" name="id" value={template.id} />
                          <Button type="submit" size="xs" variant="destructive">Delete</Button>
                        </form>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {templates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No custom templates found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
