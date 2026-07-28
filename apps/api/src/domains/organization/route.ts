import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { accounts, db, members, organizations } from '@planisfy/database'
import { AccountLifecycleError, deactivateAccount } from '@planisfy/database/accounts/lifecycle'

import type { AuthEnv } from '../../middleware/auth'
import { jsonValidator } from '../../shared/validation/validation'

const deactivateOrganizationSchema = z.object({
  organizationId: z.string().uuid(),
  confirmation: z.string().min(1),
})

export const organizationRoute = new Hono<AuthEnv>().delete(
  '/organization',
  jsonValidator(deactivateOrganizationSchema),
  async (c) => {
    const userId = c.get('userId')
    const { organizationId, confirmation } = c.req.valid('json')
    const [organization] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        memberRole: members.role,
        deletedAt: accounts.deletedAt,
      })
      .from(organizations)
      .innerJoin(accounts, eq(accounts.id, organizations.id))
      .innerJoin(
        members,
        and(eq(members.organizationId, organizations.id), eq(members.userId, userId))
      )
      .where(eq(organizations.id, organizationId))
      .limit(1)

    if (!organization) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Organization not found' } }, 404)
    }
    if (organization.memberRole !== 'owner') {
      return c.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Only an organization owner can deactivate it',
          },
        },
        403
      )
    }
    if (confirmation !== organization.name) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Organization name confirmation does not match',
          },
        },
        400
      )
    }

    try {
      const result = await deactivateAccount({
        accountId: organization.id,
        accountType: 'ORGANIZATION',
        actorId: userId,
        reason: 'Organization owner requested terminal deactivation',
      })
      return c.json({
        data: {
          deactivated: true,
          deactivatedAt: result.deactivatedAt.toISOString(),
        },
      })
    } catch (error) {
      if (error instanceof AccountLifecycleError && error.code === 'ACCOUNT_NOT_FOUND') {
        return c.json({ error: { code: 'NOT_FOUND', message: error.message } }, 404)
      }
      throw error
    }
  }
)
