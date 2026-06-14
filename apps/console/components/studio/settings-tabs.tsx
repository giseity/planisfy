"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  type ConsoleExecutionTarget,
  type ConsoleExecutionTargetEnvVar,
  type ConsoleWorkerProfile,
  type ExecutionTargetAuthMode,
  type ExecutionTargetProvider,
} from "@/lib/api";
import {
  EXECUTION_PROVIDER_PRESETS,
  billingStatusLabel,
  billingStatusVariant,
  coerceProviderValue,
  formatJson,
  formatLimit,
  numberOrUndefined,
  parseJsonObject,
  parseLooseJsonObject,
  parseUserAgent,
  splitShellList,
  targetLabel,
  timeAgo,
  type BillingInfo,
  type PlanInfo,
  type ProfileData,
  type SessionData,
} from "@/components/studio/settings-tabs-model";
import { authClient, useSession } from "@planisfy/auth/client";
import { Badge } from "@planisfy/ui/components/badge";
import { Button } from "@planisfy/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@planisfy/ui/components/alert-dialog";
import { Input } from "@planisfy/ui/components/input";
import { Label } from "@planisfy/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select";
import { Separator } from "@planisfy/ui/components/separator";
import { Skeleton } from "@planisfy/ui/components/skeleton";
import { Switch } from "@planisfy/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table";
import { Textarea } from "@planisfy/ui/components/textarea";
import {
  Check,
  Chrome,
  Github,
  KeyRound,
  Mail,
  Monitor,
  Server,
  ShieldCheck,
  Smartphone,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

export function ProfileTab() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    api
      .get<{ data: ProfileData }>("/profile")
      .then((res) => {
        setProfile(res.data);
        setDisplayName(res.data.displayName);
        setHandle(res.data.handle);
        setBio(res.data.bio ?? "");
      })
      .catch(() => setError("Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const res = await api.put<{ data: ProfileData }>("/profile", {
        displayName,
        handle,
        bio,
      });
      setProfile({ ...profile!, ...res.data });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update profile";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!profile) {
    return (
      <p className="text-sm text-destructive">
        {error || "Failed to load profile"}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Manage your public profile information.
        </p>
      </div>

      <form onSubmit={handleSave} className="max-w-lg space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            minLength={1}
            maxLength={128}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="handle">Handle</Label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">@</span>
            <Input
              id="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              required
              minLength={2}
              maxLength={64}
              pattern="^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$"
              title="Lowercase letters, numbers, hyphens, and underscores"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Lowercase letters, numbers, hyphens, and underscores only.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            placeholder="A short bio about yourself"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={profile.email} disabled />
          <p className="text-xs text-muted-foreground">
            Email cannot be changed here.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-green-600">Profile updated.</p>}

        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PreferenceRow
            title="Theme"
            description="Choose your preferred color scheme."
            control={
              <div className="flex overflow-hidden rounded-md border">
                {["Light", "Dark", "System"].map((label) => (
                  <Button
                    key={label}
                    type="button"
                    variant={label === "System" ? "secondary" : "ghost"}
                    size="sm"
                    className="rounded-none"
                  >
                    {label}
                  </Button>
                ))}
              </div>
            }
          />
          <PreferenceRow
            title="Email notifications"
            description="Receive alerts about quota, failures, and team activity."
            control={
              <Switch checked aria-label="Email notifications enabled" />
            }
          />
          <PreferenceRow
            title="Default view"
            description="Landing page after sign-in."
            control={
              <Select defaultValue="dashboard">
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dashboard">Dashboard</SelectItem>
                  <SelectItem value="styles">Styles</SelectItem>
                  <SelectItem value="operations">Operations</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            {
              provider: "Email / Password",
              icon: Mail,
              connected: true,
              detail: profile.email,
            },
            {
              provider: "GitHub",
              icon: Github,
              connected: false,
              detail: "Not connected",
            },
            {
              provider: "Google",
              icon: Chrome,
              connected: true,
              detail: "Connected via OAuth",
            },
          ].map((account) => (
            <div
              key={account.provider}
              className="flex items-center gap-3 rounded-md border p-3"
            >
              <account.icon className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{account.provider}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {account.detail}
                </p>
              </div>
              {account.connected ? (
                <Badge variant="success">Connected</Badge>
              ) : (
                <Button variant="outline" size="sm">
                  Connect
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account Tab (Password + Sessions + Danger Zone)
// ---------------------------------------------------------------------------

export function AccountTab() {
  return (
    <div className="space-y-10">
      <TwoFactorSection />
      <Separator />
      <ChangePasswordSection />
      <Separator />
      <SessionsSection />
      <Separator />
      <LoginHistorySection />
      <Separator />
      <DangerZone />
    </div>
  );
}

function TwoFactorSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          Two-factor authentication
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted">
          <Smartphone className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Authenticator app</p>
            <Badge variant="outline">Not enabled</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Add an extra layer of security by requiring a verification code from
            your authenticator app when signing in.
          </p>
          <Button className="mt-4">
            <ShieldCheck className="h-4 w-4" />
            Enable 2FA
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Failed to change password. Check your current password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Change password</h2>
        <p className="text-sm text-muted-foreground">
          Update your password. You&apos;ll stay signed in on this device.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-green-600">Password changed.</p>}

        <Button type="submit" disabled={loading}>
          {loading ? "Changing..." : "Change password"}
        </Button>
      </form>
    </div>
  );
}

function PreferenceRow({
  control,
  description,
  title,
}: {
  control: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {control}
    </div>
  );
}

function SessionsSection() {
  const { data: session } = useSession();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);

  const currentToken = session?.session?.token;

  const fetchSessions = useCallback(async () => {
    try {
      const res = await authClient.listSessions();
      if (res.data) {
        setSessions(res.data as unknown as SessionData[]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevoke = async () => {
    if (!revokeId) return;
    const sessionToRevoke = sessions.find((s) => s.id === revokeId);
    if (!sessionToRevoke) return;
    try {
      await authClient.revokeSession({ token: sessionToRevoke.token });
      setRevokeId(null);
      await fetchSessions();
    } catch {
      // ignore
    }
  };

  const handleRevokeAll = async () => {
    try {
      await authClient.revokeOtherSessions();
      setRevokeAllOpen(false);
      await fetchSessions();
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  const otherSessions = sessions.filter((s) => s.token !== currentToken);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Active Sessions</h2>
          <p className="text-sm text-muted-foreground">
            Manage your active sessions across devices.
          </p>
        </div>
        {otherSessions.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevokeAllOpen(true)}
          >
            Revoke all other sessions
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Device</TableHead>
            <TableHead>IP Address</TableHead>
            <TableHead>Last active</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s) => {
            const isCurrent = s.token === currentToken;
            return (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {parseUserAgent(s.userAgent)}
                    </span>
                    {isCurrent && (
                      <Badge variant="success" className="text-[10px]">
                        Current
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {s.ipAddress ?? "Unknown"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {timeAgo(s.updatedAt)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(s.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {!isCurrent && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setRevokeId(s.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Revoke single session */}
      <AlertDialog open={!!revokeId} onOpenChange={() => setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will sign out the device immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke all others */}
      <AlertDialog open={revokeAllOpen} onOpenChange={setRevokeAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke all other sessions?</AlertDialogTitle>
            <AlertDialogDescription>
              All devices except your current session will be signed out
              immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LoginHistorySection() {
  const loginHistory = [
    {
      time: "Jun 9, 11:30 AM",
      method: "Email / Password",
      ip: "192.168.1.42",
      status: "success",
    },
    {
      time: "Jun 8, 09:15 AM",
      method: "Google OAuth",
      ip: "10.0.0.15",
      status: "success",
    },
    {
      time: "Jun 7, 02:40 PM",
      method: "Email / Password",
      ip: "203.0.113.42",
      status: "failed",
    },
    {
      time: "Jun 6, 10:00 AM",
      method: "Email / Password",
      ip: "192.168.1.42",
      status: "success",
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Login history</h2>
        <p className="text-sm text-muted-foreground">
          Recent authentication attempts for this account.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>IP address</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loginHistory.map((entry) => (
            <TableRow key={`${entry.time}-${entry.ip}`}>
              <TableCell className="text-sm text-muted-foreground">
                {entry.time}
              </TableCell>
              <TableCell>{entry.method}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {entry.ip}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    entry.status === "success" ? "success" : "destructive"
                  }
                >
                  {entry.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danger Zone
// ---------------------------------------------------------------------------

function DangerZone() {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    api
      .get<{ data: ProfileData }>("/profile")
      .then((res) => setProfile(res.data))
      .catch(() => {});
  }, []);

  const handleDelete = async () => {
    setError("");
    setDeleting(true);
    try {
      await api.delete("/profile", { confirmation });
      router.push("/sign-in");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to delete account";
      setError(message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
        <p className="text-sm text-muted-foreground">
          Irreversible actions. Proceed with caution.
        </p>
      </div>

      <Card className="border-destructive/30">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="font-medium">Delete account</p>
            <p className="text-sm text-muted-foreground">
              Permanently delete your account and all associated data.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            Delete account
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This action is permanent. All your styles, API keys, tilesets, and
              data will be deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label>
              Type{" "}
              <span className="font-mono font-semibold">{profile?.email}</span>{" "}
              to confirm
            </Label>
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="your@email.com"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || confirmation !== profile?.email}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete my account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ExecutionTab() {
  const [targets, setTargets] = useState<ConsoleExecutionTarget[]>([]);
  const [profiles, setProfiles] = useState<ConsoleWorkerProfile[]>([]);
  const [envByTarget, setEnvByTarget] = useState<
    Record<string, ConsoleExecutionTargetEnvVar[]>
  >({});
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingTarget, setSavingTarget] = useState(false);
  const [savingEnv, setSavingEnv] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [targetName, setTargetName] = useState("");
  const [targetProvider, setTargetProvider] =
    useState<ExecutionTargetProvider>("local");
  const [targetAuthMode, setTargetAuthMode] =
    useState<ExecutionTargetAuthMode>("federated");
  const [targetRegion, setTargetRegion] = useState("");
  const [targetConfig, setTargetConfig] = useState("{}");
  const [targetCredentials, setTargetCredentials] = useState("{}");

  const [envName, setEnvName] = useState("");
  const [envValue, setEnvValue] = useState("");
  const [envDescription, setEnvDescription] = useState("");

  const [profileName, setProfileName] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [profileCommand, setProfileCommand] = useState("");
  const [profileArgs, setProfileArgs] = useState("");
  const [profileCpu, setProfileCpu] = useState("");
  const [profileMemory, setProfileMemory] = useState("");
  const [profileTimeout, setProfileTimeout] = useState("");
  const [profileConcurrency, setProfileConcurrency] = useState("");

  function applyTargetPreset(provider = targetProvider) {
    const preset = EXECUTION_PROVIDER_PRESETS[provider];
    setTargetAuthMode(preset.authMode);
    setTargetRegion(preset.region);
    setTargetConfig(formatJson(preset.config));
    setTargetCredentials(formatJson(preset.credentials));
    if (!profileImage) setProfileImage(preset.profile.image);
    if (!profileCpu) setProfileCpu(preset.profile.cpu);
    if (!profileMemory) setProfileMemory(preset.profile.memory);
    if (!profileTimeout) setProfileTimeout(preset.profile.timeout);
    if (!profileConcurrency) setProfileConcurrency(preset.profile.concurrency);
  }

  function handleTargetProviderChange(value: ExecutionTargetProvider) {
    setTargetProvider(value);
    const preset = EXECUTION_PROVIDER_PRESETS[value];
    setTargetAuthMode(preset.authMode);
    setTargetRegion(preset.region);
    setTargetConfig(formatJson(preset.config));
    setTargetCredentials(formatJson(preset.credentials));
  }

  function updateTargetConfigField(key: string, value: string) {
    setTargetConfig((current) => {
      const parsed = parseLooseJsonObject(current);
      if (value.trim()) parsed[key] = coerceProviderValue(value);
      else delete parsed[key];
      return formatJson(parsed);
    });
  }

  function updateTargetCredentialField(key: string, value: string) {
    setTargetCredentials((current) => {
      const parsed = parseLooseJsonObject(current);
      if (value.trim()) parsed[key] = value;
      else delete parsed[key];
      return formatJson(parsed);
    });
  }

  const fetchExecutionSettings = useCallback(async () => {
    try {
      const [targetsRes, profilesRes] = await Promise.all([
        api.listExecutionTargets(),
        api.listWorkerProfiles(),
      ]);
      setTargets(targetsRes.data);
      setProfiles(profilesRes.data);
      const nextSelected = selectedTargetId || targetsRes.data[0]?.id || "";
      setSelectedTargetId(nextSelected);
      if (nextSelected) {
        const envRes = await api.listExecutionTargetEnv(nextSelected);
        setEnvByTarget((current) => ({
          ...current,
          [nextSelected]: envRes.data,
        }));
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to load execution settings",
      );
    } finally {
      setLoading(false);
    }
  }, [selectedTargetId]);

  useEffect(() => {
    fetchExecutionSettings();
  }, [fetchExecutionSettings]);

  useEffect(() => {
    if (!selectedTargetId || envByTarget[selectedTargetId]) return;
    api
      .listExecutionTargetEnv(selectedTargetId)
      .then((res) =>
        setEnvByTarget((current) => ({
          ...current,
          [selectedTargetId]: res.data,
        })),
      )
      .catch((err) =>
        toast.error(
          err instanceof Error ? err.message : "Failed to load target env",
        ),
      );
  }, [envByTarget, selectedTargetId]);

  async function handleCreateTarget(e: React.FormEvent) {
    e.preventDefault();
    setSavingTarget(true);
    try {
      const config = parseJsonObject(targetConfig, "Target config");
      const credentials = parseJsonObject(targetCredentials, "Credentials");
      const res = await api.createExecutionTarget({
        name: targetName,
        provider: targetProvider,
        authMode: targetAuthMode,
        region: targetRegion || undefined,
        config,
        credentials,
      });
      setTargets((current) => [res.data, ...current]);
      setSelectedTargetId(res.data.id);
      setTargetName("");
      setTargetProvider("local");
      setTargetAuthMode("federated");
      setTargetRegion("");
      setTargetConfig("{}");
      setTargetCredentials("{}");
      toast.success("Execution target created");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create target",
      );
    } finally {
      setSavingTarget(false);
    }
  }

  async function handleDeleteTarget(id: string) {
    try {
      await api.deleteExecutionTarget(id);
      setTargets((current) => current.filter((target) => target.id !== id));
      if (selectedTargetId === id) setSelectedTargetId("");
      toast.success("Execution target deleted");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete target",
      );
    }
  }

  async function handleCreateEnv(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTargetId) return;
    setSavingEnv(true);
    try {
      const res = await api.createExecutionTargetEnv(selectedTargetId, {
        name: envName,
        value: envValue,
        description: envDescription || undefined,
        isSecret: true,
      });
      setEnvByTarget((current) => ({
        ...current,
        [selectedTargetId]: [...(current[selectedTargetId] ?? []), res.data],
      }));
      setEnvName("");
      setEnvValue("");
      setEnvDescription("");
      toast.success("Environment variable saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save env variable",
      );
    } finally {
      setSavingEnv(false);
    }
  }

  async function handleDeleteEnv(name: string) {
    if (!selectedTargetId) return;
    try {
      await api.deleteExecutionTargetEnv(selectedTargetId, name);
      setEnvByTarget((current) => ({
        ...current,
        [selectedTargetId]: (current[selectedTargetId] ?? []).filter(
          (envVar) => envVar.name !== name,
        ),
      }));
      toast.success("Environment variable deleted");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete env variable",
      );
    }
  }

  async function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await api.createWorkerProfile({
        name: profileName,
        image: profileImage || undefined,
        command: splitShellList(profileCommand),
        args: splitShellList(profileArgs),
        cpu: numberOrUndefined(profileCpu),
        memoryMb: numberOrUndefined(profileMemory),
        timeoutSeconds: numberOrUndefined(profileTimeout),
        concurrency: numberOrUndefined(profileConcurrency),
      });
      setProfiles((current) => [res.data, ...current]);
      setProfileName("");
      setProfileImage("");
      setProfileCommand("");
      setProfileArgs("");
      setProfileCpu("");
      setProfileMemory("");
      setProfileTimeout("");
      setProfileConcurrency("");
      toast.success("Worker profile created");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create profile",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleDeleteProfile(id: string) {
    try {
      await api.deleteWorkerProfile(id);
      setProfiles((current) => current.filter((profile) => profile.id !== id));
      toast.success("Worker profile deleted");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete profile",
      );
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  const selectedEnv = selectedTargetId
    ? (envByTarget[selectedTargetId] ?? [])
    : [];

  return (
    <div className="space-y-10">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Execution targets</h2>
          </div>
          <form
            onSubmit={handleCreateTarget}
            className="grid gap-3 md:grid-cols-2"
          >
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={targetProvider}
                onValueChange={(value) =>
                  handleTargetProviderChange(value as ExecutionTargetProvider)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="aws_batch">AWS Batch</SelectItem>
                  <SelectItem value="gcp_batch">Google Cloud Batch</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Auth mode</Label>
              <Select
                value={targetAuthMode}
                onValueChange={(value) =>
                  setTargetAuthMode(value as ExecutionTargetAuthMode)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="federated">Federated</SelectItem>
                  <SelectItem value="static">Static fallback</SelectItem>
                  <SelectItem value="external">External</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Region</Label>
              <Input
                value={targetRegion}
                onChange={(e) => setTargetRegion(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <ProviderConfigFields
                provider={targetProvider}
                config={parseLooseJsonObject(targetConfig)}
                credentials={parseLooseJsonObject(targetCredentials)}
                onConfigChange={updateTargetConfigField}
                onCredentialChange={updateTargetCredentialField}
                onApplyPreset={() => applyTargetPreset()}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Config JSON</Label>
              <Textarea
                value={targetConfig}
                onChange={(e) => setTargetConfig(e.target.value)}
                rows={3}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Credential JSON</Label>
              <Textarea
                value={targetCredentials}
                onChange={(e) => setTargetCredentials(e.target.value)}
                rows={3}
                className="font-mono text-xs"
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={!targetName || savingTarget}>
                {savingTarget ? "Saving..." : "Create target"}
              </Button>
            </div>
          </form>
          <div className="grid gap-3 md:grid-cols-2">
            {targets.map((target) => (
              <Card key={target.id} className="rounded-lg">
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{target.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {targetLabel(target.provider)}{" "}
                        {target.region ? `- ${target.region}` : ""}
                      </div>
                    </div>
                    <Badge
                      variant={target.hasCredentials ? "success" : "secondary"}
                    >
                      {target.authMode}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant={
                        selectedTargetId === target.id ? "secondary" : "outline"
                      }
                      size="sm"
                      onClick={() => setSelectedTargetId(target.id)}
                    >
                      <KeyRound className="mr-2 h-4 w-4" />
                      Env
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDeleteTarget(target.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Target env</h2>
          </div>
          <form onSubmit={handleCreateEnv} className="space-y-3">
            <Select
              value={selectedTargetId}
              onValueChange={setSelectedTargetId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Target" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={envName}
                onChange={(e) => setEnvName(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <Input
                type="password"
                value={envValue}
                onChange={(e) => setEnvValue(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={envDescription}
                onChange={(e) => setEnvDescription(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={!selectedTargetId || !envName || !envValue || savingEnv}
            >
              {savingEnv ? "Saving..." : "Save variable"}
            </Button>
          </form>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedEnv.map((envVar) => (
                <TableRow key={envVar.id}>
                  <TableCell className="font-mono text-xs">
                    {envVar.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {envVar.value}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDeleteEnv(envVar.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>

      <Separator />

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Monitor className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Worker profiles</h2>
        </div>
        <form
          onSubmit={handleCreateProfile}
          className="grid gap-3 md:grid-cols-4"
        >
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Image</Label>
            <Input
              value={profileImage}
              onChange={(e) => setProfileImage(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>CPU</Label>
            <Input
              type="number"
              min={1}
              value={profileCpu}
              onChange={(e) => setProfileCpu(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Memory MB</Label>
            <Input
              type="number"
              min={128}
              value={profileMemory}
              onChange={(e) => setProfileMemory(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Timeout seconds</Label>
            <Input
              type="number"
              min={1}
              value={profileTimeout}
              onChange={(e) => setProfileTimeout(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Concurrency</Label>
            <Input
              type="number"
              min={1}
              value={profileConcurrency}
              onChange={(e) => setProfileConcurrency(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Command</Label>
            <Input
              value={profileCommand}
              onChange={(e) => setProfileCommand(e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>Args</Label>
            <Input
              value={profileArgs}
              onChange={(e) => setProfileArgs(e.target.value)}
            />
          </div>
          <div className="md:col-span-4">
            <Button type="submit" disabled={!profileName || savingProfile}>
              {savingProfile ? "Saving..." : "Create profile"}
            </Button>
          </div>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Image</TableHead>
              <TableHead>CPU</TableHead>
              <TableHead>Memory</TableHead>
              <TableHead>Timeout</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((profile) => (
              <TableRow key={profile.id}>
                <TableCell className="font-medium">{profile.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {profile.image ?? "-"}
                </TableCell>
                <TableCell>{profile.cpu ?? "-"}</TableCell>
                <TableCell>
                  {profile.memoryMb ? `${profile.memoryMb} MB` : "-"}
                </TableCell>
                <TableCell>
                  {profile.timeoutSeconds ? `${profile.timeoutSeconds}s` : "-"}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDeleteProfile(profile.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

function ProviderConfigFields({
  provider,
  config,
  credentials,
  onConfigChange,
  onCredentialChange,
  onApplyPreset,
}: {
  provider: ExecutionTargetProvider;
  config: Record<string, unknown>;
  credentials: Record<string, unknown>;
  onConfigChange: (key: string, value: string) => void;
  onCredentialChange: (key: string, value: string) => void;
  onApplyPreset: () => void;
}) {
  const text = (source: Record<string, unknown>, key: string) =>
    source[key] === undefined || source[key] === null
      ? ""
      : String(source[key]);

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{targetLabel(provider)} preset</p>
          <p className="text-xs text-muted-foreground">
            Fill the common provider fields, then use JSON for advanced options.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onApplyPreset}
        >
          <Wand2 className="mr-1.5 h-4 w-4" />
          Preset
        </Button>
      </div>

      {provider === "local" && (
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Queue">
            <Input
              value={text(config, "queue")}
              onChange={(e) => onConfigChange("queue", e.target.value)}
              placeholder="geodata"
            />
          </Field>
          <Field label="Max concurrent jobs">
            <Input
              type="number"
              min={1}
              value={text(config, "maxConcurrentJobs")}
              onChange={(e) =>
                onConfigChange("maxConcurrentJobs", e.target.value)
              }
            />
          </Field>
          <Field label="Working directory">
            <Input
              value={text(config, "workingDirectory")}
              onChange={(e) =>
                onConfigChange("workingDirectory", e.target.value)
              }
              placeholder="/data/storage"
            />
          </Field>
        </div>
      )}

      {provider === "aws_batch" && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Job queue">
            <Input
              value={text(config, "jobQueue")}
              onChange={(e) => onConfigChange("jobQueue", e.target.value)}
              placeholder="planisfy-geodata"
            />
          </Field>
          <Field label="Job definition">
            <Input
              value={text(config, "jobDefinition")}
              onChange={(e) => onConfigChange("jobDefinition", e.target.value)}
              placeholder="planisfy-geodata-worker"
            />
          </Field>
          <Field label="Retry attempts">
            <Input
              type="number"
              min={0}
              value={text(config, "retryAttempts")}
              onChange={(e) => onConfigChange("retryAttempts", e.target.value)}
            />
          </Field>
          <Field label="Role ARN">
            <Input
              value={text(credentials, "roleArn")}
              onChange={(e) => onCredentialChange("roleArn", e.target.value)}
              placeholder="arn:aws:iam::...:role/..."
            />
          </Field>
        </div>
      )}

      {provider === "gcp_batch" && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Project ID">
            <Input
              value={text(config, "projectId")}
              onChange={(e) => onConfigChange("projectId", e.target.value)}
              placeholder="my-gcp-project"
            />
          </Field>
          <Field label="Location">
            <Input
              value={text(config, "location")}
              onChange={(e) => onConfigChange("location", e.target.value)}
              placeholder="us-central1"
            />
          </Field>
          <Field label="Job name prefix">
            <Input
              value={text(config, "jobNamePrefix")}
              onChange={(e) => onConfigChange("jobNamePrefix", e.target.value)}
              placeholder="planisfy-geodata"
            />
          </Field>
          <Field label="Service account email">
            <Input
              value={text(credentials, "serviceAccountEmail")}
              onChange={(e) =>
                onCredentialChange("serviceAccountEmail", e.target.value)
              }
              placeholder="worker@project.iam.gserviceaccount.com"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing Tab
// ---------------------------------------------------------------------------

export function BillingTab() {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<BillingInfo>("/billing"),
      api.get<PlanInfo[]>("/billing/plans"),
    ])
      .then(([b, p]) => {
        setBilling(b);
        setPlans(p);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !billing) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  const quotaColor =
    billing.quotaPercent >= 90
      ? "bg-red-500"
      : billing.quotaPercent >= 70
        ? "bg-yellow-500"
        : "bg-green-500";

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Current Plan</CardTitle>
            <Badge
              variant={
                billing.plan === "free"
                  ? "secondary"
                  : billing.plan === "enterprise"
                    ? "warning"
                    : "success"
              }
            >
              {billing.planName}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge
              variant={
                billing.deploymentMode === "managed" ? "success" : "secondary"
              }
            >
              {billing.deploymentMode === "managed" ? "Managed" : "Self-host"}
            </Badge>
            <Badge variant={billingStatusVariant(billing.billingStatus)}>
              {billingStatusLabel(billing.billingStatus)}
            </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-sm text-muted-foreground">Monthly Units</p>
              <p className="text-lg font-semibold">
                {billing.usage.monthlyUnits.toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {formatLimit(billing.limits.monthlyUnits)}
                </span>
              </p>
              <div className="h-2 bg-muted rounded-full mt-1">
                <div
                  className={`h-full rounded-full ${quotaColor} transition-all`}
                  style={{
                    width: `${Math.min(billing.quotaPercent, 100)}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Styles</p>
              <p className="text-lg font-semibold">
                {billing.usage.styles}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {formatLimit(billing.limits.maxStyles)}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tilesets</p>
              <p className="text-lg font-semibold">
                {billing.usage.sources}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {formatLimit(billing.limits.maxSources)}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">API Keys</p>
              <p className="text-lg font-semibold">
                {billing.usage.apiKeys}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {formatLimit(billing.limits.maxApiKeys)}
                </span>
              </p>
            </div>
          </div>

          {billing.quotaPercent >= 80 && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 px-4 py-3 text-sm mb-4">
              You&apos;ve used {billing.quotaPercent}% of your monthly quota.
              Consider upgrading to avoid service interruptions.
            </div>
          )}

          {billing.portalAvailable && billing.plan !== "free" && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const { url } = await api.get<{ url: string }>(
                    "/billing/portal",
                  );
                  window.open(url, "_blank");
                } catch {
                  toast.error("Billing portal is not available");
                }
              }}
            >
              Manage Subscription
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Plan Comparison */}
      <h2 className="text-lg font-semibold">Plans</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === billing.plan;
          return (
            <Card key={plan.id} className={isCurrent ? "border-primary" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {isCurrent && <Badge>Current</Badge>}
                </div>
                <p className="text-2xl font-bold">
                  {plan.price === 0 ? "Free" : `$${plan.price}`}
                  {plan.price > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      /mo
                    </span>
                  )}
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.monthlyUnits === "Unlimited"
                      ? "Unlimited"
                      : Number(plan.monthlyUnits).toLocaleString()}{" "}
                    API units/month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.requestsPerMinute.toLocaleString()} requests/minute
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.maxStyles === "Unlimited"
                      ? "Unlimited"
                      : plan.maxStyles}{" "}
                    styles
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.maxSources === "Unlimited"
                      ? "Unlimited"
                      : plan.maxSources}{" "}
                    tilesets
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {plan.maxApiKeys === "Unlimited"
                      ? "Unlimited"
                      : plan.maxApiKeys}{" "}
                    API keys
                  </li>
                </ul>

                {!isCurrent && plan.price > 0 && (
                  <Button
                    className="w-full mt-4"
                    variant={plan.id === "pro" ? "default" : "outline"}
                    disabled={!plan.checkoutAvailable}
                    onClick={async () => {
                      if (!plan.checkoutAvailable) {
                        toast.info(
                          "Billing is not configured yet. Set Dodo Payments credentials to enable payments.",
                        );
                        return;
                      }
                      try {
                        const { url } = await api.post<{ url: string }>(
                          "/billing/checkout",
                          { planId: plan.id },
                        );
                        window.open(url, "_blank");
                      } catch {
                        toast.error("Unable to start checkout");
                      }
                    }}
                  >
                    {plan.checkoutAvailable
                      ? `Upgrade to ${plan.name}`
                      : "Coming soon"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                {
                  id: "INV-2026-006",
                  period: "Jun 2026",
                  amount: "$0.00",
                  status: "current",
                },
                {
                  id: "INV-2026-005",
                  period: "May 2026",
                  amount: "$0.00",
                  status: "paid",
                },
                {
                  id: "INV-2026-004",
                  period: "Apr 2026",
                  amount: "$0.00",
                  status: "paid",
                },
              ].map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono text-xs">
                    {invoice.id}
                  </TableCell>
                  <TableCell>{invoice.period}</TableCell>
                  <TableCell className="font-medium">
                    {invoice.amount}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        invoice.status === "paid" ? "success" : "secondary"
                      }
                    >
                      {invoice.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
