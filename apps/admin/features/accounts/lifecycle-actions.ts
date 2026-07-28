'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { accounts, db, users } from '@planisfy/database'
import { setAccountLifecycle } from '@planisfy/database/accounts/lifecycle'
import { platformRoles } from '@planisfy/utils'

import { requirePlatformPermission } from '@/features/auth/admin-auth'

const lifecycleStatuses = ['ACTIVE', 'SUSPENDED', 'BANNED'] as const
type LifecycleStatus = (typeof lifecycleStatuses)[number]

export async function changeUserLifecycleAction(formData: FormData) {
  const actor = await requirePlatformPermission('platform.users.manage')
  const accountId = requiredString(formData, 'accountId')
  const status = lifecycleStatus(formData.get('status'))
  const reason = optionalString(formData.get('reason'))

  if (actor.userId === accountId) {
    throw new Error('You cannot change your own lifecycle state')
  }

  const [target] = await db
    .select({ role: users.role, deletedAt: accounts.deletedAt })
    .from(users)
    .innerJoin(accounts, eq(accounts.id, users.id))
    .where(eq(users.id, accountId))
    .limit(1)
  if (!target) throw new Error('User account not found')
  if (target.deletedAt) throw new Error('Deactivated users cannot be restored')
  if (platformRoles.indexOf(actor.role) <= platformRoles.indexOf(target.role)) {
    throw new Error('You cannot manage an equal-or-higher platform role')
  }

  await setAccountLifecycle({
    accountId,
    status,
    reason,
    actorId: actor.userId,
  })
  revalidatePath(`/users/${accountId}`)
  revalidatePath('/users')
}

export async function changeOrganizationLifecycleAction(formData: FormData) {
  const actor = await requirePlatformPermission('platform.organizations.manage')
  const accountId = requiredString(formData, 'accountId')
  const status = lifecycleStatus(formData.get('status'))
  const reason = optionalString(formData.get('reason'))

  const [target] = await db
    .select({ type: accounts.type, deletedAt: accounts.deletedAt })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1)
  if (!target) throw new Error('Organization account not found')
  if (target.type !== 'ORGANIZATION') {
    throw new Error('Target is not an organization account')
  }
  if (target.deletedAt) {
    throw new Error('Deactivated organizations cannot be restored')
  }

  await setAccountLifecycle({
    accountId,
    status,
    reason,
    actorId: actor.userId,
  })
  revalidatePath(`/orgs/${accountId}`)
  revalidatePath('/orgs')
}

function requiredString(formData: FormData, key: string) {
  const value = formData.get(key)
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} is required`)
  }
  return value.trim()
}

function optionalString(value: FormDataEntryValue | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function lifecycleStatus(value: FormDataEntryValue | null): LifecycleStatus {
  if (typeof value !== 'string' || !lifecycleStatuses.includes(value as LifecycleStatus)) {
    throw new Error('Invalid lifecycle status')
  }
  return value as LifecycleStatus
}
