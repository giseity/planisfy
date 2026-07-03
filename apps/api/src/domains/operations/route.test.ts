import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deliverNotification,
  buildNotificationDeliveryProof,
  canConsoleCreateScheduleKind,
  canUseConsoleOperatorOperation,
  formatSseEvent,
  isValidScheduleTimezone,
  nextScheduleRunAt,
  operationsOverviewSignature,
  prepareScheduledOperationRun,
  prepareWorkflowTemplateApplication,
  validateServingWorker,
  validateScheduleInput,
  validateNotificationTarget,
  validatePreviewTargetUrl,
} from './route'

test('formatSseEvent emits EventSource-compatible frames', () => {
  assert.equal(
    formatSseEvent('operations', { status: 'ok', progress: 50 }),
    'event: operations\ndata: {"status":"ok","progress":50}\n\n'
  )
})

test('operationsOverviewSignature ignores volatile display-only fields', () => {
  const overview = {
    deploymentMode: 'self_host',
    recentJobs: [
      {
        id: 'job-1',
        status: 'PROCESSING',
        progress: 20,
        updatedAt: new Date('2026-06-12T12:00:00Z'),
      },
    ],
    notificationChannels: [],
    scheduledOperations: [],
    artifactBackups: [],
    workerNodes: [],
    routingGraphBuilds: [],
    basemapBuilds: [],
    basemapReleases: [],
    runtimeInstallations: [],
    previewLinks: [],
    customDomains: [],
    workflowTemplates: [
      {
        id: 'builtin',
        builtIn: true,
        createdAt: new Date('2026-06-12T12:00:00Z'),
      },
    ],
    workerHealth: {
      status: 'healthy',
      message: 'Heartbeat 1s ago',
      latencyMs: 1,
    },
    staleJobReconciliation: {
      reconciled: 0,
      latest: [],
    },
  }
  const changedOnlyVolatileFields = {
    ...overview,
    workflowTemplates: [
      {
        id: 'builtin',
        builtIn: true,
        createdAt: new Date('2026-06-12T12:00:02Z'),
      },
    ],
    workerHealth: {
      status: 'healthy',
      message: 'Heartbeat 3s ago',
      latencyMs: 3,
    },
  }

  assert.equal(
    operationsOverviewSignature(overview as never),
    operationsOverviewSignature(changedOnlyVolatileFields as never)
  )
})

test('operationsOverviewSignature tracks basemap build and release state', () => {
  const overview = {
    deploymentMode: 'self_host',
    recentJobs: [],
    notificationChannels: [],
    scheduledOperations: [],
    artifactBackups: [],
    workerNodes: [],
    routingGraphBuilds: [],
    basemapBuilds: [
      {
        id: 'build-1',
        status: 'succeeded',
        activationStatus: 'inactive',
        progress: 100,
        updatedAt: new Date('2026-06-12T12:00:00Z'),
        completedAt: new Date('2026-06-12T12:00:00Z'),
        cancelRequestedAt: null,
      },
    ],
    basemapReleases: [
      {
        id: 'release-1',
        status: 'published',
        activationStatus: 'active',
        isPrimary: false,
        updatedAt: new Date('2026-06-12T12:00:00Z'),
        publishedAt: new Date('2026-06-12T12:00:00Z'),
        activatedAt: new Date('2026-06-12T12:00:00Z'),
      },
    ],
    previewLinks: [],
    runtimeInstallations: [],
    customDomains: [],
    workflowTemplates: [],
    workerHealth: { status: 'healthy', message: 'ok', latencyMs: 1 },
    staleJobReconciliation: { reconciled: 0, latest: [] },
  }
  const changed = {
    ...overview,
    basemapReleases: [{ ...overview.basemapReleases[0], isPrimary: true }],
  }

  assert.notEqual(
    operationsOverviewSignature(overview as never),
    operationsOverviewSignature(changed as never)
  )
})

test('validateServingWorker requires activation capability and config', () => {
  const baseNode = {
    id: 'node-1',
    accountId: 'account-1',
    name: 'serving-node',
    kind: 'remote',
    endpoint: null,
    validation: null,
    lastSeenAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }

  assert.equal(
    validateServingWorker({
      ...baseNode,
      status: 'healthy',
      metadata: { capabilities: ['basemap_build'] },
    } as never)?.code,
    'WORKER_CAPABILITY_REQUIRED'
  )
  assert.equal(
    validateServingWorker({
      ...baseNode,
      status: 'healthy',
      metadata: { capabilities: ['self_host_activation'] },
    } as never)?.code,
    'SERVING_WORKER_ACTIVATION_CONFIG_REQUIRED'
  )
  assert.equal(
    validateServingWorker({
      ...baseNode,
      status: 'healthy',
      metadata: {
        capabilities: ['self_host_activation'],
        activation: { martinSourcesDir: '/data/martin-sources' },
      },
    } as never)?.code,
    'SERVING_WORKER_SUPERVISOR_REQUIRED'
  )
  assert.equal(
    validateServingWorker({
      ...baseNode,
      status: 'healthy',
      metadata: {
        capabilities: ['self_host_activation'],
        activation: {
          martinSourcesDir: '/data/martin-sources',
          runtimeSupervisorConfigured: true,
        },
      },
    } as never),
    null
  )
})

test('validateScheduleInput requires tilesetId for rebuild schedules', () => {
  const baseSchedule = {
    name: 'Nightly rebuild',
    kind: 'tileset_rebuild',
    cron: '0 2 * * *',
    timezone: 'UTC',
  }

  assert.equal(validateScheduleInput({ ...baseSchedule, payload: {} }).success, false)
  assert.equal(
    validateScheduleInput({
      ...baseSchedule,
      payload: { tilesetId: 'tileset-1' },
    }).success,
    true
  )
})

test('managed console blocks operator-only operations', () => {
  assert.equal(canUseConsoleOperatorOperation('managed', 'artifact_backups'), false)
  assert.equal(canUseConsoleOperatorOperation('managed', 'workflow_templates'), false)
  assert.equal(canUseConsoleOperatorOperation('managed', 'custom_command_schedules'), false)
  assert.equal(canUseConsoleOperatorOperation('self_host', 'artifact_backups'), true)
})

test('managed console allows only tenant-safe schedule creation kinds', () => {
  assert.equal(canConsoleCreateScheduleKind('managed', 'tileset_rebuild'), true)
  assert.equal(canConsoleCreateScheduleKind('managed', 'source_import'), true)
  assert.equal(canConsoleCreateScheduleKind('managed', 'custom_command'), false)
  assert.equal(canConsoleCreateScheduleKind('self_host', 'custom_command'), true)
})

test('validateScheduleInput rejects invalid cron and timezone values', () => {
  const baseSchedule = {
    name: 'Nightly rebuild',
    kind: 'source_import',
    cron: '0 2 * * *',
    timezone: 'UTC',
    payload: {},
  }

  assert.equal(validateScheduleInput({ ...baseSchedule, cron: 'whenever' }).success, false)
  assert.equal(
    validateScheduleInput({
      ...baseSchedule,
      timezone: 'Mars/OlympusMons',
    }).success,
    false
  )
  assert.equal(isValidScheduleTimezone('Africa/Lagos'), true)
})

test('nextScheduleRunAt evaluates standard five-field cron expressions', () => {
  const next = nextScheduleRunAt(
    'active',
    '*/15 9-17 * * 1-5',
    'UTC',
    new Date('2026-06-18T16:46:30.000Z')
  )

  assert.equal(next?.toISOString(), '2026-06-18T17:00:00.000Z')
  assert.equal(
    nextScheduleRunAt('paused', '*/15 9-17 * * 1-5', 'UTC', new Date('2026-06-18T16:46:30.000Z')),
    null
  )
})

test('prepareScheduledOperationRun blocks inactive schedules and shapes outbox', () => {
  const now = new Date('2026-06-18T16:46:30.000Z')
  const paused = prepareScheduledOperationRun(
    {
      id: 'schedule-1',
      accountId: 'account-1',
      kind: 'source_import',
      status: 'paused',
      cron: '0 * * * *',
      timezone: 'UTC',
      payload: {},
      deletedAt: null,
    },
    now
  )
  assert.equal(paused.success, false)
  if (!paused.success) {
    assert.equal(paused.code, 'SCHEDULE_PAUSED')
  }

  const prepared = prepareScheduledOperationRun(
    {
      id: 'schedule-1',
      accountId: 'account-1',
      kind: 'source_import',
      status: 'active',
      cron: '0 * * * *',
      timezone: 'UTC',
      payload: { provider: 'OVERTURE' },
      deletedAt: null,
    },
    now
  )
  assert.equal(prepared.success, true)
  if (prepared.success) {
    assert.equal(prepared.update.lastRunAt, now)
    assert.equal(prepared.update.nextRunAt?.toISOString(), '2026-06-18T17:00:00.000Z')
    assert.deepEqual(prepared.outbox, {
      eventName: 'scheduled_operation.run_requested',
      payload: {
        accountId: 'account-1',
        scheduleId: 'schedule-1',
        kind: 'source_import',
        payload: { provider: 'OVERTURE' },
        requestedAt: '2026-06-18T16:46:30.000Z',
      },
    })
  }
})

test('applying schedule template prepares a schedule payload', () => {
  const prepared = prepareWorkflowTemplateApplication(
    {
      id: 'template-1',
      name: 'Nightly import',
      category: 'schedule',
      template: {
        kind: 'source_import',
        cron: '0 2 * * *',
        payload: { provider: 'OVERTURE' },
      },
    },
    {}
  )

  assert.equal(prepared.success, true)
  if (prepared.success) {
    assert.equal(prepared.data.category, 'schedule')
    assert.equal(prepared.data.values.name, 'Nightly import')
    assert.equal(prepared.data.values.kind, 'source_import')
    assert.deepEqual(prepared.data.values.payload, { provider: 'OVERTURE' })
  }
})

test('applying invalid template returns validation error', () => {
  const prepared = prepareWorkflowTemplateApplication(
    {
      id: 'template-1',
      name: 'Broken rebuild',
      category: 'schedule',
      template: {
        kind: 'tileset_rebuild',
        cron: '0 2 * * *',
        payload: {},
      },
    },
    {}
  )

  assert.equal(prepared.success, false)
  if (!prepared.success) {
    assert.match(JSON.stringify(prepared.error.flatten()), /tilesetId payload value/)
  }
})

test('Slack and Discord notification payloads post to target', async () => {
  const calls: Array<{ url: string; body: unknown }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url, init) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body)),
    })
    return new Response('', { status: 200 })
  }) as typeof fetch

  try {
    await deliverNotification(
      {
        provider: 'slack',
        target: 'https://hooks.slack.com/services/T000/B000/XXX',
      },
      {
        event: 'notification.test',
        message: 'Planisfy test notification',
        timestamp: '2026-06-15T00:00:00.000Z',
      }
    )
    await deliverNotification(
      {
        provider: 'discord',
        target: 'https://discord.com/api/webhooks/123/abc',
      },
      {
        event: 'notification.test',
        message: 'Planisfy test notification',
        timestamp: '2026-06-15T00:00:00.000Z',
      }
    )
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.deepEqual(calls, [
    {
      url: 'https://hooks.slack.com/services/T000/B000/XXX',
      body: { text: 'Planisfy test notification\nnotification.test' },
    },
    {
      url: 'https://discord.com/api/webhooks/123/abc',
      body: { content: 'Planisfy test notification\nnotification.test' },
    },
  ])
})

test('notification targets reject private hosts and wrong provider hosts', async () => {
  assert.throws(
    () => validateNotificationTarget('webhook', 'http://127.0.0.1:8080/hook'),
    /private|reserved/
  )
  assert.throws(
    () => validateNotificationTarget('slack', 'https://example.com/slack'),
    /not allowed/
  )
  assert.throws(
    () => validateNotificationTarget('discord', 'http://discord.com/api/webhooks/123/abc'),
    /https/
  )
  assert.equal(
    validateNotificationTarget('discord', 'https://discordapp.com/api/webhooks/123/abc'),
    'https://discordapp.com/api/webhooks/123/abc'
  )
})

test('preview targets allow only http and https URLs', () => {
  assert.equal(
    validatePreviewTargetUrl('https://example.com/preview?token=abc'),
    'https://example.com/preview?token=abc'
  )
  assert.throws(() => validatePreviewTargetUrl('javascript:alert(1)'), /http or https/)
  assert.throws(() => validatePreviewTargetUrl('/relative-preview'), /valid URL/)
})

test('preview workflow templates reject unsafe target URLs', () => {
  const prepared = prepareWorkflowTemplateApplication(
    {
      id: 'template-1',
      name: 'Preview',
      category: 'preview',
      template: {
        resourceType: 'tileset',
        resourceId: '00000000-0000-4000-8000-000000000001',
        targetUrl: 'javascript:alert(1)',
      },
    },
    {}
  )

  assert.equal(prepared.success, false)
  if (!prepared.success) {
    assert.match(JSON.stringify(prepared.error.flatten()), /http or https/)
  }
})

test('deliverNotification does not fetch rejected targets', async () => {
  let called = false
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    called = true
    return new Response('', { status: 200 })
  }) as typeof fetch

  try {
    const result = await deliverNotification(
      { provider: 'webhook', target: 'http://169.254.169.254/latest' },
      {
        event: 'notification.test',
        message: 'Planisfy test notification',
        timestamp: '2026-06-15T00:00:00.000Z',
      }
    )

    assert.equal(called, false)
    assert.equal(result.delivered, false)
    assert.equal(result.status, 400)
    assert.equal(result.code, 'NOTIFICATION_TARGET_REJECTED')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('buildNotificationDeliveryProof stores sanitized adapter evidence', () => {
  assert.deepEqual(
    buildNotificationDeliveryProof(
      {
        delivered: false,
        adapter: 'email',
        status: 503,
        code: 'EMAIL_UNAVAILABLE',
        message: 'Email delivery is unavailable because ZeptoMail is not configured.',
      },
      new Date('2026-06-18T12:00:00.000Z')
    ),
    {
      checkedAt: '2026-06-18T12:00:00.000Z',
      delivered: false,
      adapter: 'email',
      status: 503,
      code: 'EMAIL_UNAVAILABLE',
      message: 'Email delivery is unavailable because ZeptoMail is not configured.',
    }
  )
})

test('email notification adapter reports unavailable when email config is missing', async () => {
  const result = await deliverNotification(
    { provider: 'email', target: 'ops@example.com' },
    {
      event: 'notification.test',
      message: 'Planisfy test notification',
      timestamp: '2026-06-15T00:00:00.000Z',
    }
  )

  assert.equal(result.delivered, false)
  assert.equal(result.status, 503)
  assert.equal(result.code, 'EMAIL_UNAVAILABLE')
})
