"use client";

import { useState } from "react";
import { api, type ConsoleNotificationChannel } from "@/lib/api";
import { splitList } from "@/features/operations/model";
import {
  EmptyRow,
  Field,
  runAction,
  StatusBadge,
} from "@/features/operations/ui";
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
import { Bell, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function NotificationsTab({
  channels,
  onChanged,
}: {
  channels: ConsoleNotificationChannel[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [provider, setProvider] =
    useState<ConsoleNotificationChannel["provider"]>("webhook");
  const [target, setTarget] = useState("");
  const [events, setEvents] = useState("job.failed,job.succeeded,schedule.due");

  async function createChannel() {
    await runAction(
      () =>
        api.createNotificationChannel({
          name,
          provider,
          target,
          events: splitList(events),
        }),
      "Notification channel created",
      () => {
        setName("");
        setTarget("");
        onChanged();
      },
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Add Channel</CardTitle>
          <CardDescription>
            Webhook, Slack, and Discord tests post immediately. Email tests use
            Resend when it is configured.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Provider">
            <Select
              value={provider}
              onValueChange={(value) =>
                setProvider(value as ConsoleNotificationChannel["provider"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="slack">Slack</SelectItem>
                <SelectItem value="discord">Discord</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Target">
            <Input value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
          <Field label="Events">
            <Input value={events} onChange={(e) => setEvents(e.target.value)} />
          </Field>
          <Button onClick={createChannel} disabled={!name || !target}>
            <Bell className="mr-1.5 h-4 w-4" />
            Create
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notification Channels</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Events</TableHead>
                <TableHead className="w-[112px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((channel) => (
                <TableRow key={channel.id}>
                  <TableCell className="font-medium">{channel.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={channel.provider} />
                  </TableCell>
                  <TableCell>{channel.events.join(", ") || "All"}</TableCell>
                  <TableCell className="space-x-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testChannel(channel.id, onChanged)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        runAction(
                          () => api.deleteNotificationChannel(channel.id),
                          "Channel deleted",
                          onChanged,
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {channels.length === 0 && (
                <EmptyRow
                  colSpan={4}
                  label="No notification channels configured."
                />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

async function testChannel(id: string, onChanged: () => void) {
  try {
    const result = await api.testNotificationChannel(id);
    if (result.data.delivered) {
      toast.success(result.data.message || "Test delivered");
    } else {
      toast.error(result.data.message || "Test delivery failed");
    }
    onChanged();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Test delivery failed");
  }
}
