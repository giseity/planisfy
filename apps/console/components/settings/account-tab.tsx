"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  parseUserAgent,
  timeAgo,
  type ProfileData,
  type SessionData,
} from "@/components/settings/model";
import { authClient, useSession } from "@planisfy/auth/client";
import { Badge } from "@planisfy/ui/components/badge";
import { Button } from "@planisfy/ui/components/button";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card";
import { Input } from "@planisfy/ui/components/input";
import { Label } from "@planisfy/ui/components/label";
import { Separator } from "@planisfy/ui/components/separator";
import { Skeleton } from "@planisfy/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table";
import { Monitor, ShieldCheck, Smartphone, X } from "lucide-react";

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
