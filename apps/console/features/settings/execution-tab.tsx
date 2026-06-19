"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";
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
  coerceProviderValue,
  formatJson,
  numberOrUndefined,
  parseJsonObject,
  parseLooseJsonObject,
  splitShellList,
  targetLabel,
} from "@/features/settings/model";
import { ProviderConfigFields } from "@/features/settings/execution-fields";
import { Badge } from "@planisfy/ui/components/badge";
import { Button } from "@planisfy/ui/components/button";
import { Card, CardContent } from "@planisfy/ui/components/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table";
import { Textarea } from "@planisfy/ui/components/textarea";
import { KeyRound, Monitor, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
