"use client";

import { useState } from "react";
import {
  api,
  type ConsoleCustomDomain,
  type ConsolePreviewLink,
  type ConsoleTileset,
} from "@/lib/api";
import {
  EmptyRow,
  Field,
  runAction,
  StatusBadge,
} from "@/components/operations/ui";
import { Button } from "@planisfy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card";
import { Input } from "@planisfy/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table";
import { CheckCircle2, ExternalLink, Globe, Link2, Trash2 } from "lucide-react";

export function DeliveryTab({
  previews,
  domains,
  tilesets,
  onChanged,
}: {
  previews: ConsolePreviewLink[];
  domains: ConsoleCustomDomain[];
  tilesets: ConsoleTileset[];
  onChanged: () => void;
}) {
  const [previewResourceType, setPreviewResourceType] = useState("tileset");
  const [previewResourceId, setPreviewResourceId] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [domainResourceType, setDomainResourceType] = useState("tileset");
  const [domainResourceId, setDomainResourceId] = useState("");
  const [host, setHost] = useState("");

  function selectResource(value: string, target: "preview" | "domain") {
    if (target === "preview")
      setPreviewResourceId(value === "manual" ? "" : value);
    else setDomainResourceId(value === "manual" ? "" : value);
  }

  async function createPreview() {
    await runAction(
      () =>
        api.createPreviewLink({
          resourceType: previewResourceType,
          resourceId: previewResourceId,
          targetUrl,
        }),
      "Preview link created",
      () => {
        setPreviewResourceId("");
        setTargetUrl("");
        onChanged();
      },
    );
  }

  async function createDomain() {
    await runAction(
      () =>
        api.createCustomDomain({
          resourceType: domainResourceType,
          resourceId: domainResourceId || undefined,
          host,
        }),
      "Custom domain created",
      () => {
        setDomainResourceId("");
        setHost("");
        onChanged();
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create Preview</CardTitle>
            <CardDescription>
              Temporary links can point at TileJSON, style JSON, or review URLs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Resource type">
                <Select
                  value={previewResourceType}
                  onValueChange={setPreviewResourceType}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tileset">Tileset</SelectItem>
                    <SelectItem value="style">Style</SelectItem>
                    <SelectItem value="dataset">Dataset</SelectItem>
                    <SelectItem value="url">URL</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Resource">
                <ResourceSelector
                  resourceId={previewResourceId}
                  resourceType={previewResourceType}
                  tilesets={tilesets}
                  onSelect={(value) => selectResource(value, "preview")}
                  onManual={setPreviewResourceId}
                />
              </Field>
            </div>
            <Field label="Target URL">
              <Input
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
              />
            </Field>
            <Button
              onClick={createPreview}
              disabled={!previewResourceId || !targetUrl}
            >
              <Link2 className="mr-1.5 h-4 w-4" />
              Create preview
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Add Domain</CardTitle>
            <CardDescription>
              Domains start pending with a verification token for DNS setup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Resource type">
                <Select
                  value={domainResourceType}
                  onValueChange={setDomainResourceType}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tileset">Tileset</SelectItem>
                    <SelectItem value="style">Style</SelectItem>
                    <SelectItem value="dataset">Dataset</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Resource">
                <ResourceSelector
                  resourceId={domainResourceId}
                  resourceType={domainResourceType}
                  tilesets={tilesets}
                  onSelect={(value) => selectResource(value, "domain")}
                  onManual={setDomainResourceId}
                />
              </Field>
            </div>
            <Field label="Host">
              <Input value={host} onChange={(e) => setHost(e.target.value)} />
            </Field>
            <Button onClick={createDomain} disabled={!host}>
              <Globe className="mr-1.5 h-4 w-4" />
              Add domain
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DeliveryList
          title="Preview Links"
          rows={previews}
          onChanged={onChanged}
        />
        <DomainList domains={domains} onChanged={onChanged} />
      </div>
    </div>
  );
}

function ResourceSelector({
  onManual,
  onSelect,
  resourceId,
  resourceType,
  tilesets,
}: {
  onManual: (value: string) => void;
  onSelect: (value: string) => void;
  resourceId: string;
  resourceType: string;
  tilesets: ConsoleTileset[];
}) {
  if (resourceType !== "tileset" || tilesets.length === 0) {
    return (
      <Input value={resourceId} onChange={(e) => onManual(e.target.value)} />
    );
  }

  return (
    <div className="space-y-2">
      <Select value={resourceId || "manual"} onValueChange={onSelect}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="manual">Manual ID</SelectItem>
          {tilesets.map((tileset) => (
            <SelectItem key={tileset.id} value={tileset.id}>
              {tileset.name} ({tileset.handle})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input value={resourceId} onChange={(e) => onManual(e.target.value)} />
    </div>
  );
}

function DeliveryList({
  title,
  rows,
  onChanged,
}: {
  title: string;
  rows: ConsolePreviewLink[];
  onChanged: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Slug</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead className="w-[96px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.slug}</TableCell>
                <TableCell>{row.resourceType}</TableCell>
                <TableCell className="space-x-1">
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={row.targetUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open preview ${row.slug}`}
                      title="Open preview"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Delete preview ${row.slug}`}
                    title="Delete preview"
                    onClick={() =>
                      runAction(
                        () => api.deletePreviewLink(row.id),
                        "Preview deleted",
                        onChanged,
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <EmptyRow colSpan={3} label="No preview links yet." />
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DomainList({
  domains,
  onChanged,
}: {
  domains: ConsoleCustomDomain[];
  onChanged: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom Domains</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Host</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Token</TableHead>
              <TableHead className="w-[112px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {domains.map((domain) => (
              <TableRow key={domain.id}>
                <TableCell className="font-medium">{domain.host}</TableCell>
                <TableCell>
                  <StatusBadge status={domain.status} />
                </TableCell>
                <TableCell className="max-w-[180px] truncate text-xs">
                  {domain.verificationToken}
                </TableCell>
                <TableCell className="space-x-1">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Verify domain ${domain.host}`}
                    title="Verify domain"
                    onClick={() =>
                      runAction(
                        () => api.verifyCustomDomain(domain.id),
                        "Domain verified",
                        onChanged,
                      )
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Delete domain ${domain.host}`}
                    title="Delete domain"
                    onClick={() =>
                      runAction(
                        () => api.deleteCustomDomain(domain.id),
                        "Domain deleted",
                        onChanged,
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {domains.length === 0 && (
              <EmptyRow colSpan={4} label="No custom domains yet." />
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
