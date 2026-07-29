const routingOrder = [
  'assigned',
  'preparing',
  'downloading_source',
  'building_admins',
  'building_tiles',
  'packaging',
  'uploading',
] as const

const basemapOrder = [
  'assigned',
  'preparing',
  'downloading_source',
  'building_tiles',
  'packaging',
  'uploading',
] as const

export const terminalBuildStatuses = ['succeeded', 'failed', 'canceled'] as const

export function isTerminalBuildStatus(status: string) {
  return terminalBuildStatuses.includes(status as (typeof terminalBuildStatuses)[number])
}

export function canApplyBuildTransition(params: {
  kind: 'routing' | 'basemap'
  current: string
  next: string
}) {
  if (isTerminalBuildStatus(params.current)) return params.current === params.next
  if (isTerminalBuildStatus(params.next)) return true
  if (params.current === params.next) return true

  const order: readonly string[] = params.kind === 'routing' ? routingOrder : basemapOrder
  const currentIndex = order.indexOf(params.current)
  const nextIndex = order.indexOf(params.next)
  return currentIndex >= 0 && nextIndex >= currentIndex
}

export function canApplyActivationTransition(current: string, next: 'active' | 'failed') {
  if (current === next) return true
  return current === 'activating'
}
