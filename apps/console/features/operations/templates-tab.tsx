"use client";

import { useState } from "react";
import { api, type ConsoleWorkflowTemplate } from "@/lib/api";
import { parseJsonObject } from "@/features/operations/model";
import { EmptyRow, Field, runAction } from "@/features/operations/ui";
import { Button } from "@planisfy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card";
import { Input } from "@planisfy/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table";
import { Textarea } from "@planisfy/ui/components/textarea";
import { CheckCircle2, ClipboardList, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function TemplatesTab({
  templates,
  onChanged,
}: {
  templates: ConsoleWorkflowTemplate[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("import-workflow");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState("{}");

  async function createTemplate() {
    await runAction(
      () =>
        api.createWorkflowTemplate({
          name,
          category,
          description: description || undefined,
          template: parseJsonObject(template),
        }),
      "Template created",
      () => {
        setName("");
        setDescription("");
        setTemplate("{}");
        onChanged();
      },
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Create Template</CardTitle>
          <CardDescription>
            Store reusable JSON payloads for execution targets, schedules, and
            preview workflows. Apply runs server-side validation for the
            template category.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Category">
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </Field>
          <Field label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Template JSON">
            <Textarea
              rows={6}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
          </Field>
          <Button onClick={createTemplate} disabled={!name || !category}>
            <ClipboardList className="mr-1.5 h-4 w-4" />
            Create
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Workflow Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="w-[112px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((templateRow) => (
                <TableRow key={templateRow.id}>
                  <TableCell className="font-medium">
                    {templateRow.name}
                  </TableCell>
                  <TableCell>{templateRow.category}</TableCell>
                  <TableCell>
                    {templateRow.builtIn ? "Built-in" : "Custom"}
                  </TableCell>
                  <TableCell className="space-x-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => applyTemplate(templateRow.id, onChanged)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    {!templateRow.builtIn && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          runAction(
                            () => api.deleteWorkflowTemplate(templateRow.id),
                            "Template deleted",
                            onChanged,
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {templates.length === 0 && (
                <EmptyRow colSpan={4} label="No templates available." />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

async function applyTemplate(id: string, onChanged: () => void) {
  try {
    const result = await api.applyWorkflowTemplate(id);
    if (result.data.applied) {
      toast.success("Template applied");
      onChanged();
      return;
    }
    toast.info(
      result.data.message ?? result.data.status ?? "Template reviewed",
    );
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Template apply failed");
  }
}
