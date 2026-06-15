"use client";

import { useState } from "react";
import { api, type ConsoleWorkerNode } from "@/lib/api";
import { formatDate } from "@/components/operations/model";
import {
  EmptyRow,
  Field,
  runAction,
  StatusBadge,
} from "@/components/operations/ui";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table";
import { RefreshCw, ServerCog, Trash2 } from "lucide-react";

export function WorkersTab({
  nodes,
  onChanged,
}: {
  nodes: ConsoleWorkerNode[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ConsoleWorkerNode["kind"]>("local");
  const [endpoint, setEndpoint] = useState("");

  async function createNode() {
    await runAction(
      () =>
        api.createWorkerNode({ name, kind, endpoint: endpoint || undefined }),
      "Worker node added",
      () => {
        setName("");
        setEndpoint("");
        onChanged();
      },
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Register Worker</CardTitle>
          <CardDescription>
            Local workers validate by heartbeat; remote and cloud workers
            validate by endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Kind">
            <Select
              value={kind}
              onValueChange={(value) =>
                setKind(value as ConsoleWorkerNode["kind"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
                <SelectItem value="cloud">Cloud</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Endpoint">
            <Input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://worker.example.com/health"
            />
          </Field>
          <Button onClick={createNode} disabled={!name}>
            <ServerCog className="mr-1.5 h-4 w-4" />
            Register
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Worker Nodes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className="w-[112px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes.map((node) => (
                <TableRow key={node.id}>
                  <TableCell className="font-medium">{node.name}</TableCell>
                  <TableCell>{node.kind}</TableCell>
                  <TableCell>
                    <StatusBadge status={node.status} />
                  </TableCell>
                  <TableCell>{formatDate(node.lastSeenAt)}</TableCell>
                  <TableCell className="space-x-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        runAction(
                          () => api.validateWorkerNode(node.id),
                          "Worker validated",
                          onChanged,
                        )
                      }
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        runAction(
                          () => api.deleteWorkerNode(node.id),
                          "Worker deleted",
                          onChanged,
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {nodes.length === 0 && (
                <EmptyRow colSpan={5} label="No worker nodes registered." />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
