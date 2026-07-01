export type DeploymentMode = 'self_host' | 'managed'

export function allowsHostedUpgradePrompts(mode: DeploymentMode | null | undefined) {
  return mode === 'managed'
}
