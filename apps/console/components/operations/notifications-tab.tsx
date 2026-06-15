"use client";

import { useState } from "react";
import { api, type ConsoleNotificationChannel } from "@/lib/api";
import { splitList } from "@/components/operations/model";
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
import { Bell, CheckCircle2, Trash2 } from "lucide-react";

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
            Webhook delivery is active; email and chat providers are stored for
            adapter rollout.
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
                      onClick={() =>
                        runAction(
                          () => api.testNotificationChannel(channel.id),
                          "Test sent",
                          onChanged,
                        )
                      }
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
