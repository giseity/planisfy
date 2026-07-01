'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { authClient, organization, useSession } from '@planisfy/auth/client'
import {
  PROFILE_AVATAR_UPDATED_EVENT,
  type ProfileAvatarUpdatedDetail,
} from '@/lib/profile-avatar-events'
import { api } from '@/lib/api'
import type { BillingInfo } from '@/features/settings/model'
import { allowsHostedUpgradePrompts } from '@/lib/deployment-mode'
import { normalizeConsoleUrl } from '@/lib/console-api/normalizers'
import { cn } from '@planisfy/ui/lib/utils'
import { Button } from '@planisfy/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@planisfy/ui/components/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@planisfy/ui/components/dropdown-menu'
import { Input } from '@planisfy/ui/components/input'
import { Label } from '@planisfy/ui/components/label'
import {
  Check,
  ChevronsUpDown,
  EllipsisVertical,
  LogOut,
  Plus,
  Settings,
  Shield,
  User,
} from 'lucide-react'
import { toast } from 'sonner'

interface OrgItem {
  id: string
  name: string
  slug: string
  logo: string | null
}

type SessionUser = {
  name?: string | null
  email?: string | null
  image?: string | null
}

const sidebarTriggerClass =
  'flex min-h-12 w-full items-center gap-2 overflow-hidden rounded-lg px-2 py-2 text-left text-[0.8125rem] transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]/sidebar:mx-auto group-data-[collapsible=icon]/sidebar:size-8 group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:p-0'

function Avatar({
  name,
  image,
  className,
}: {
  name: string
  image?: string | null
  className?: string
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'

  if (image) {
    return (
      <span
        aria-hidden="true"
        className={cn('size-8 shrink-0 rounded-lg bg-cover bg-center', className)}
        style={{ backgroundImage: `url(${image})` }}
      />
    )
  }

  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground',
        className
      )}
    >
      {initials}
    </span>
  )
}

function useMounted() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  )
}

function useProfileAvatarImage(sessionImage?: string | null) {
  const sessionAvatarUrl = normalizeConsoleUrl(sessionImage ?? null)
  const [avatarOverride, setAvatarOverride] = useState<{
    sessionImage?: string | null
    avatarUrl: string | null
  } | null>(null)

  useEffect(() => {
    function handleAvatarUpdated(event: Event) {
      setAvatarOverride({
        sessionImage,
        avatarUrl: (event as CustomEvent<ProfileAvatarUpdatedDetail>).detail.avatarUrl,
      })
    }

    window.addEventListener(PROFILE_AVATAR_UPDATED_EVENT, handleAvatarUpdated)
    return () => {
      window.removeEventListener(PROFILE_AVATAR_UPDATED_EVENT, handleAvatarUpdated)
    }
  }, [sessionImage])

  if (avatarOverride && avatarOverride.sessionImage === sessionImage) {
    return avatarOverride.avatarUrl
  }

  return sessionAvatarUrl
}

export function NavAccountSwitcher() {
  const router = useRouter()
  const { data: session } = useSession()
  const [orgs, setOrgs] = useState<OrgItem[]>([])
  const [activeOrg, setActiveOrg] = useState<OrgItem | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [billing, setBilling] = useState<BillingInfo | null>(null)

  const user = session?.user as SessionUser | undefined
  const userName = user?.name || user?.email || 'Personal'
  const userAvatar = useProfileAvatarImage(user?.image)

  useEffect(() => {
    organization.list().then((res) => {
      if (res.data) {
        setOrgs(res.data as OrgItem[])
      }
    })
    api
      .get<BillingInfo>('/billing')
      .then(setBilling)
      .catch(() => setBilling(null))
  }, [])

  useEffect(() => {
    if (!session?.session) return

    const s = session.session as { activeOrganizationId?: string | null }
    if (!s.activeOrganizationId) {
      setActiveOrg(null)
      return
    }

    organization.getFullOrganization().then((res) => {
      if (res.data) {
        setActiveOrg(res.data as unknown as OrgItem)
      }
    })
  }, [session])

  const switchContext = async (orgId: string | null) => {
    await organization.setActive({ organizationId: orgId })
    setActiveOrg(orgId ? (orgs.find((org) => org.id === orgId) ?? null) : null)
    router.refresh()
  }

  const handleCreate = async (formData: FormData) => {
    const name = formData.get('name') as string
    const slug = formData.get('slug') as string
    if (!name?.trim() || !slug?.trim()) return

    setCreating(true)
    try {
      const res = await organization.create({ name, slug })
      if (res.data) {
        const newOrg = res.data as unknown as OrgItem
        setOrgs((previous) => [...previous, newOrg])
        await switchContext(newOrg.id)
        setCreateOpen(false)
        router.push('/organization')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create organization')
    } finally {
      setCreating(false)
    }
  }

  const currentName = activeOrg?.name ?? userName
  const currentHandle = activeOrg?.slug ?? 'personal'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={sidebarTriggerClass}>
            <Avatar name={currentName} image={activeOrg?.logo} />
            <span className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]/sidebar:hidden">
              <span className="truncate font-medium">{currentName}</span>
              <span className="truncate text-xs text-muted-foreground">{currentHandle}</span>
            </span>
            <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]/sidebar:hidden" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-(--radix-dropdown-menu-trigger-width) min-w-72 rounded-lg"
          side="right"
          align="start"
          sideOffset={8}
        >
          <DropdownMenuItem
            onSelect={() => switchContext(null)}
            className="flex items-center justify-between"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={userName} image={userAvatar} />
              <span className="grid min-w-0 leading-tight">
                <span className="truncate font-medium">{userName}</span>
                <span className="truncate text-xs text-muted-foreground">personal</span>
              </span>
            </span>
            {!activeOrg && <Check className="ml-2 size-4" />}
          </DropdownMenuItem>
          {orgs.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {orgs.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onSelect={() => switchContext(org.id)}
                  className="flex items-center justify-between"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={org.name} image={org.logo} />
                    <span className="grid min-w-0 leading-tight">
                      <span className="truncate font-medium">{org.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{org.slug}</span>
                    </span>
                  </span>
                  {activeOrg?.id === org.id && <Check className="ml-2 size-4" />}
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          {billing?.plan !== 'free' || !allowsHostedUpgradePrompts(billing?.deploymentMode) ? (
            <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" />
              Create organization
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => router.push('/billing')}>
              <Plus className="mr-2 size-4" />
              Upgrade for organizations
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form action={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create organization</DialogTitle>
              <DialogDescription>
                Organizations let you collaborate with your team and share resources like styles,
                tilesets, and API keys.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="org-name">Name</Label>
                <Input
                  id="org-name"
                  name="name"
                  placeholder="Acme Corp"
                  required
                  autoFocus
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="org-slug">Slug</Label>
                <Input
                  id="org-slug"
                  name="slug"
                  placeholder="acme-corp"
                  required
                  pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Lowercase letters, numbers, and hyphens only. Used in URLs.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function NavUser() {
  const router = useRouter()
  const mounted = useMounted()
  const { data: session } = useSession()
  const user = session?.user as SessionUser | undefined
  const userAvatar = useProfileAvatarImage(user?.image)

  if (!mounted || !user) {
    return <div aria-hidden="true" className="min-h-12 rounded-lg" />
  }

  const displayName = user.name || user.email || 'Account'
  const email = user.email ?? ''

  const handleSignOut = async () => {
    await authClient.signOut()
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={sidebarTriggerClass}>
          <Avatar name={displayName} image={userAvatar} />
          <span className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]/sidebar:hidden">
            <span className="truncate font-medium">{displayName}</span>
            {email && <span className="truncate text-xs text-muted-foreground">{email}</span>}
          </span>
          <EllipsisVertical className="ml-auto size-4 group-data-[collapsible=icon]/sidebar:hidden" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
        side="right"
        align="end"
        sideOffset={8}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <span className="flex items-center gap-2 px-1 py-1.5 text-left text-[0.8125rem]">
            <Avatar name={displayName} image={userAvatar} />
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate font-medium">{displayName}</span>
              {email && <span className="truncate text-xs text-muted-foreground">{email}</span>}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/settings/profile')}>
          <User className="mr-2 size-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push('/settings/security')}>
          <Shield className="mr-2 size-4" />
          Security
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push('/settings')}>
          <Settings className="mr-2 size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut}>
          <LogOut className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
