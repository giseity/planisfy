'use client'

import { useState } from 'react'
import { api, type ConsoleScheduledOperation, type ConsoleTileset } from '@/lib/api'
import { formatDate, schedulePayload } from '@/features/operations/model'
import { EmptyRow, Field, runAction, StatusBadge } from '@/features/operations/ui'
import { Button } from '@planisfy/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@planisfy/ui/components/card'
import { Input } from '@planisfy/ui/components/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@planisfy/ui/components/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@planisfy/ui/components/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@planisfy/ui/components/table'
import { Textarea } from '@planisfy/ui/components/textarea'
import { CalendarClock, MoreHorizontal, Play, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type CustomerScheduleKind = Extract<
  ConsoleScheduledOperation['kind'],
  'tileset_rebuild' | 'source_import'
>

export function SchedulesTab({
  schedules,
  tilesets,
  onChanged,
}: {
  schedules: ConsoleScheduledOperation[]
  tilesets: ConsoleTileset[]
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<CustomerScheduleKind>('tileset_rebuild')
  const [cron, setCron] = useState('0 2 * * *')
  const [timezone, setTimezone] = useState('UTC')
  const [tilesetId, setTilesetId] = useState('')
  const [payload, setPayload] = useState('{}')
  const [saving, setSaving] = useState(false)
  const requiresTileset = kind === 'tileset_rebuild'
  const canCreateSchedule =
    name.trim().length > 0 && !saving && (!requiresTileset || Boolean(tilesetId))

  async function createSchedule() {
    if (requiresTileset && !tilesetId) {
      toast.error('Select a tileset before creating a rebuild schedule')
      return
    }
    setSaving(true)
    try {
      await api.createScheduledOperation({
        name,
        kind,
        cron,
        timezone,
        payload: schedulePayload({
          kind,
          payload,
          tilesetId,
        }),
      })
      setName('')
      setPayload('{}')
      toast.success('Schedule created')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create schedule')
    } finally {
      setSaving(false)
    }
  }

  async function runSchedule(id: string) {
    await runAction(() => api.runScheduledOperation(id), 'Schedule run queued', onChanged)
  }

  async function deleteSchedule(id: string) {
    await runAction(() => api.deleteScheduledOperation(id), 'Schedule deleted', onChanged)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Create Schedule</CardTitle>
          <CardDescription>
            Store recurring import, rebuild, or command requests. Runs enqueue operational events
            for workers to process.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Kind">
            <Select
              value={kind}
              onValueChange={(value) => setKind(value as CustomerScheduleKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tileset_rebuild">Tileset rebuild</SelectItem>
                <SelectItem value="source_import">Source import</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cron">
              <Input value={cron} onChange={(e) => setCron(e.target.value)} />
            </Field>
            <Field label="Timezone">
              <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </Field>
          </div>
          <Field label="Tileset">
            <Select
              value={tilesetId || 'none'}
              onValueChange={(value) => setTilesetId(value === 'none' ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No tileset</SelectItem>
                {tilesets.map((tileset) => (
                  <SelectItem key={tileset.id} value={tileset.id}>
                    {tileset.name} ({tileset.handle})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {requiresTileset && !tilesetId && (
              <p className="text-xs text-muted-foreground">
                Required for tileset rebuild schedules.
              </p>
            )}
          </Field>
          <Field label="Advanced payload JSON">
            <Textarea rows={5} value={payload} onChange={(e) => setPayload(e.target.value)} />
          </Field>
          <Button onClick={createSchedule} disabled={!canCreateSchedule}>
            <CalendarClock className="mr-1.5 h-4 w-4" />
            Create
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Scheduled Operations</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Name</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Cron</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead className="w-10 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell className="min-w-[220px] font-medium">{schedule.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={schedule.kind} />
                  </TableCell>
                  <TableCell>{schedule.cron}</TableCell>
                  <TableCell>{formatDate(schedule.nextRunAt)}</TableCell>
                  <TableCell className="w-10 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${schedule.name} actions`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => runSchedule(schedule.id)}>
                          <Play className="mr-2 h-4 w-4" />
                          Run schedule
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={() => deleteSchedule(schedule.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete schedule
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {schedules.length === 0 && <EmptyRow colSpan={5} label="No schedules configured." />}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
