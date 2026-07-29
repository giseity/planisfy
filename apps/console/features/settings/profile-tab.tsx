"use client";

import { FileDropzone } from "@/components/file-upload/file-dropzone";
import { dispatchProfileAvatarUpdated } from "@/lib/profile-avatar-events";
import type React from "react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { api } from "@/lib/api";
import { type ProfileData } from "@/features/settings/model";
import { Button } from "@planisfy/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card";
import { Input } from "@planisfy/ui/components/input";
import { Label } from "@planisfy/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select";
import { Skeleton } from "@planisfy/ui/components/skeleton";
import { Switch } from "@planisfy/ui/components/switch";
import { Textarea } from "@planisfy/ui/components/textarea";
import { Camera, Trash2 } from "lucide-react";

const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp";
const AVATAR_ACCEPTED_LABEL = "PNG, JPEG, or WebP";
const MAX_AVATAR_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024;

export function ProfileTab() {
  const { setTheme, theme } = useTheme();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarDeleting, setAvatarDeleting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesError, setPreferencesError] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    api
      .getProfile()
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
      const res = await api.updateProfile({
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

  const handleAvatarUpload = async (file: File) => {
    setAvatarUploading(true);
    setError("");
    setSuccess(false);

    try {
      const res = await api.uploadProfileAvatar(file);
      setProfile(res.data);
      dispatchProfileAvatarUpdated(res.data.avatarUrl);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to upload avatar";
      setError(message);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAvatarDelete = async () => {
    setAvatarDeleting(true);
    setError("");
    setSuccess(false);

    try {
      const res = await api.deleteProfileAvatar();
      setProfile(res.data);
      dispatchProfileAvatarUpdated(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to remove avatar";
      setError(message);
    } finally {
      setAvatarDeleting(false);
    }
  };

  const updatePreferences = async (
    preferences: Partial<ProfileData["preferences"]>,
  ) => {
    if (!profile) return;
    setPreferencesSaving(true);
    setPreferencesError("");

    try {
      const response = await api.updateProfilePreferences(preferences);
      setProfile(response.data);
    } catch (err: unknown) {
      setPreferencesError(
        err instanceof Error ? err.message : "Failed to update preferences",
      );
    } finally {
      setPreferencesSaving(false);
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
          <Label>Avatar</Label>
          <div className="flex items-start gap-3">
            <div
              className="flex size-16 shrink-0 items-center justify-center rounded-xl border bg-muted bg-cover bg-center text-sm font-semibold text-muted-foreground"
              style={
                profile.avatarUrl
                  ? { backgroundImage: `url(${profile.avatarUrl})` }
                  : undefined
              }
              aria-hidden="true"
            >
              {!profile.avatarUrl
                ? displayName
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join("") || "U"
                : null}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <FileDropzone
                id="profile-avatar-upload-file"
                accept={AVATAR_ACCEPT}
                acceptedLabel={AVATAR_ACCEPTED_LABEL}
                maxSizeBytes={MAX_AVATAR_UPLOAD_SIZE_BYTES}
                title={avatarUploading ? "Uploading..." : "Upload avatar"}
                description="Drop image or click to browse"
                emptyIcon={<Camera className="size-3.5 opacity-60" />}
                disabled={avatarUploading || avatarDeleting}
                variant="compact"
                showSelectedFile={false}
                onFileAccepted={handleAvatarUpload}
              />
              {profile.avatarUrl && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAvatarDelete}
                  disabled={avatarUploading || avatarDeleting}
                >
                  <Trash2 className="mr-2 size-4" />
                  {avatarDeleting ? "Removing..." : "Remove avatar"}
                </Button>
              )}
            </div>
          </div>
        </div>

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
                    variant={
                      theme === label.toLowerCase() ? "secondary" : "ghost"
                    }
                    size="sm"
                    className="rounded-none"
                    onClick={() => setTheme(label.toLowerCase())}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            }
          />
          <PreferenceRow
            title="Email notifications"
            description="Receive quota warning emails. Transactional account and invitation emails are unaffected."
            control={
              <Switch
                checked={profile.preferences.emailNotificationsEnabled}
                disabled={preferencesSaving}
                aria-label="Email notifications enabled"
                onCheckedChange={(checked) =>
                  void updatePreferences({
                    emailNotificationsEnabled: checked,
                  })
                }
              />
            }
          />
          <PreferenceRow
            title="Default view"
            description="Landing page after sign-in."
            control={
              <Select
                value={profile.preferences.defaultView}
                disabled={preferencesSaving}
                onValueChange={(defaultView) =>
                  void updatePreferences({
                    defaultView: defaultView as ProfileData["preferences"]["defaultView"],
                  })
                }
              >
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
          {preferencesError && (
            <p className="text-sm text-destructive">{preferencesError}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account Tab (Password + Sessions + Danger Zone)
// ---------------------------------------------------------------------------

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
