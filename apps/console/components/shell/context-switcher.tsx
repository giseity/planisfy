"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { organization, useSession } from "@planisfy/auth/client";
import { cn } from "@planisfy/ui/lib/utils";
import { Button } from "@planisfy/ui/components/button";
import { Input } from "@planisfy/ui/components/input";
import { Label } from "@planisfy/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@planisfy/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@planisfy/ui/components/dropdown-menu";
import { Building2, ChevronDown, Plus, User } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { BillingInfo } from "@/features/settings/model";
import { allowsHostedUpgradePrompts } from "@/lib/deployment-mode";

interface OrgItem {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
}

export function ContextSwitcher() {
  const router = useRouter();
  const { data: session } = useSession();
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [activeOrg, setActiveOrg] = useState<OrgItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [billing, setBilling] = useState<BillingInfo | null>(null);

  useEffect(() => {
    organization.list().then((res) => {
      if (res.data) {
        setOrgs(res.data as OrgItem[]);
      }
    });
    api
      .get<BillingInfo>("/billing")
      .then(setBilling)
      .catch(() => setBilling(null));
  }, []);

  useEffect(() => {
    if (session?.session) {
      const s = session.session as { activeOrganizationId?: string | null };
      if (s.activeOrganizationId) {
        organization.getFullOrganization().then((res) => {
          if (res.data) {
            setActiveOrg(res.data as unknown as OrgItem);
          }
        });
      } else {
        setActiveOrg(null);
      }
    }
  }, [session]);

  const switchContext = async (orgId: string | null) => {
    await organization.setActive({ organizationId: orgId });
    setActiveOrg(orgId ? (orgs.find((o) => o.id === orgId) ?? null) : null);
    router.refresh();
  };

  const handleCreate = async (formData: FormData) => {
    const name = formData.get("name") as string;
    const slug = formData.get("slug") as string;
    if (!name?.trim() || !slug?.trim()) return;

    setCreating(true);
    try {
      const res = await organization.create({ name, slug });
      if (res.data) {
        const newOrg = res.data as unknown as OrgItem;
        setOrgs((prev) => [...prev, newOrg]);
        await switchContext(newOrg.id);
        setCreateOpen(false);
        router.push("/organization");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create organization",
      );
    } finally {
      setCreating(false);
    }
  };

  const label = activeOrg
    ? activeOrg.name
    : (session?.user?.name ?? "Personal");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 max-w-[180px]">
            {activeOrg ? (
              <Building2 className="h-4 w-4 shrink-0" />
            ) : (
              <User className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">{label}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Switch context
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => switchContext(null)}
            className={cn(!activeOrg && "bg-muted")}
          >
            <User className="h-4 w-4 mr-2" />
            Personal
          </DropdownMenuItem>
          {orgs.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Organizations
              </DropdownMenuLabel>
              {orgs.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => switchContext(org.id)}
                  className={cn(activeOrg?.id === org.id && "bg-muted")}
                >
                  <Building2 className="h-4 w-4 mr-2" />
                  {org.name}
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          {billing?.plan !== "free" || !allowsHostedUpgradePrompts(billing?.deploymentMode) ? (
            <DropdownMenuItem onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create organization
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => router.push("/billing")}>
              <Plus className="h-4 w-4 mr-2" />
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
                Organizations let you collaborate with your team and share
                resources like styles, tilesets, and API keys.
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
                <p className="text-xs text-muted-foreground mt-1">
                  Lowercase letters, numbers, and hyphens only. Used in URLs.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
