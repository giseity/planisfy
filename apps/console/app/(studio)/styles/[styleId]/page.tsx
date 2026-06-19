"use client";

import { useEffect, useCallback, useState } from "react";
import NextLink from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { clientEnv } from "@/env.client";
import { useStyleStore } from "@/features/style-editor/store/style-store";
import { sampleStyle } from "@/lib/sample-style";
import { MapPreview } from "@/features/style-editor/components/map-preview";
import { LayerList } from "@/features/style-editor/components/layer-list";
import { PropertyPanel } from "@/features/style-editor/components/property-panel";
import { SourcePanel } from "@/features/style-editor/components/source-panel";
import { StyleSettingsPanel } from "@/features/style-editor/components/style-settings-panel";
import { JsonEditor } from "@/features/style-editor/components/json-editor";
import { Separator } from "@planisfy/ui/components/separator";
import { Button } from "@planisfy/ui/components/button";
import { LoadingState } from "@planisfy/ui/components/loading-state";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@planisfy/ui/components/resizable";
import { StatusAlert } from "@planisfy/ui/components/status-alert";
import { ValidationPanel } from "@/features/style-editor/components/validation-panel";
import { VersionHistoryButton } from "@/features/style-editor/components/version-history";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@planisfy/ui/components/popover";
import { Input } from "@planisfy/ui/components/input";
import {
  Download,
  Upload,
  Undo2,
  Redo2,
  Code2,
  MousePointerClick,
  AlertTriangle,
  ClipboardCopy,
  Link,
  Check,
  Settings,
  Save,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Globe,
  GlobeLock,
} from "lucide-react";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function StyleEditorPage() {
  const params = useParams<{ styleId: string }>();
  const loadStyle = useStyleStore((s) => s.loadStyle);
  const loadStyleFromApi = useStyleStore((s) => s.loadStyleFromApi);
  const saveStyle = useStyleStore((s) => s.saveStyle);
  const publishStyle = useStyleStore((s) => s.publishStyle);
  const style = useStyleStore((s) => s.style);
  const styleName = useStyleStore((s) => s.style?.name);
  const updateStyleName = useStyleStore((s) => s.updateStyleName);
  const selectedLayerId = useStyleStore((s) => s.selectedLayerId);
  const deleteLayer = useStyleStore((s) => s.deleteLayer);
  const duplicateLayer = useStyleStore((s) => s.duplicateLayer);
  const undo = useStyleStore((s) => s.undo);
  const redo = useStyleStore((s) => s.redo);
  const canUndo = useStyleStore((s) => s.canUndo);
  const canRedo = useStyleStore((s) => s.canRedo);
  const saveStatus = useStyleStore((s) => s.saveStatus);
  const styleId = useStyleStore((s) => s.styleId);
  const styleHandle = useStyleStore((s) => s.styleHandle);
  const isPublic = useStyleStore((s) => s.isPublic);
  const publishedVersion = useStyleStore((s) => s.publishedVersion);
  const lastSavedAt = useStyleStore((s) => s.lastSavedAt);
  const [showJson, setShowJson] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ownerHandle, setOwnerHandle] = useState<string | null>(null);
  const [leftPanelTab, setLeftPanelTab] = useState("layers");

  const searchParams = useSearchParams();

  // Load style from API, a URL import, or the local starter style for new drafts.
  useEffect(() => {
    const id = params.styleId;
    setLoadError(null);

    if (UUID_RE.test(id)) {
      loadStyleFromApi(id).catch((err) => {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load style",
        );
      });
      return;
    }

    const styleUrl = searchParams.get("url");
    if (id === "new" && styleUrl) {
      fetch(styleUrl)
        .then((r) => r.json())
        .then((json) => {
          if (json.version === 8 && Array.isArray(json.layers)) {
            loadStyle(json);
          } else {
            setLoadError("The URL did not return a MapLibre style document");
          }
        })
        .catch((err) => {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load style URL",
          );
        });
      return;
    }

    if (id === "new") {
      loadStyle(sampleStyle);
      return;
    }

    setLoadError(
      "Style not found. Open an existing style or use /styles/new to start a draft.",
    );
  }, [params.styleId, searchParams, loadStyle, loadStyleFromApi]);

  useEffect(() => {
    api
      .getProfile()
      .then(({ data }) => setOwnerHandle(data.handle))
      .catch(() => setOwnerHandle(null));
  }, []);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Cmd+S — save
      if (mod && e.key === "s") {
        e.preventDefault();
        if (styleId) saveStyle().catch(() => {});
        return;
      }
      // Cmd+Z — undo
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      // Cmd+Shift+Z or Cmd+Y — redo
      if ((mod && e.key === "z" && e.shiftKey) || (mod && e.key === "y")) {
        e.preventDefault();
        redo();
        return;
      }
      // Cmd+D — duplicate selected layer
      if (mod && e.key === "d" && selectedLayerId) {
        e.preventDefault();
        duplicateLayer(selectedLayerId);
        return;
      }
      // Delete — remove selected layer (only when not in an input)
      if (e.key === "Delete" && selectedLayerId && !isInput) {
        e.preventDefault();
        deleteLayer(selectedLayerId);
        return;
      }
    },
    [
      undo,
      redo,
      selectedLayerId,
      deleteLayer,
      duplicateLayer,
      styleId,
      saveStyle,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleExport = () => {
    if (!style) return;
    const blob = new Blob([JSON.stringify(style, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${style.name || "style"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyUrl = async (label: string, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(label);
    toast.success(`${label} URL copied`);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const draftUrl = () =>
    `${window.location.origin}/styles/${styleId ?? params.styleId}`;
  const publicApiRoot = () =>
    `${window.location.origin}${clientEnv.NEXT_PUBLIC_CONSOLE_API_PATH.replace(/\/console\/?$/, "")}`;
  const publicUrl = (version?: number | null) => {
    const handle = styleHandle || styleId;
    if (!ownerHandle || !handle) return "";
    return `${publicApiRoot()}/styles/v1/${ownerHandle}/${handle}${version ? `@${version}` : ""}`;
  };
  const mapLibreSnippet = () => {
    const url = publicUrl();
    if (!url) return "";
    return `new maplibregl.Map({\n  container: "map",\n  style: "${url}"\n});`;
  };

  const handlePublishToggle = async () => {
    if (!styleId) return;
    setPublishing(true);
    try {
      const nextPublic = await publishStyle();
      toast.success(nextPublic ? "Style published" : "Style unpublished");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update publish state",
      );
    } finally {
      setPublishing(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!style) return;
    await navigator.clipboard.writeText(JSON.stringify(style, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        if (json.version === 8 && Array.isArray(json.layers)) {
          loadStyle(json);
        }
      } catch {
        // Invalid file
      }
    };
    input.click();
  };

  const handleLoadFromUrl = async () => {
    if (!urlInput.trim()) return;
    setUrlLoading(true);
    try {
      const r = await fetch(urlInput.trim());
      const json = await r.json();
      if (json.version === 8 && Array.isArray(json.layers)) {
        loadStyle(json);
      }
    } catch {
      // Invalid URL or style
    } finally {
      setUrlLoading(false);
    }
  };

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center">
        <StatusAlert
          variant="destructive"
          icon={<AlertCircle className="h-4 w-4" />}
          title="Style failed to load"
          description={loadError}
        />
      </div>
    );
  }

  if (!style) {
    return (
      <LoadingState
        className="h-screen rounded-none border-0"
        label="Loading style editor..."
      />
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Toolbar */}
      <header className="flex h-10 items-center gap-2 border-b bg-background px-3">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Back to styles"
        >
          <NextLink href="/styles" aria-label="Back to styles">
            <ChevronLeft className="h-3.5 w-3.5" />
          </NextLink>
        </Button>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Studio / Styles
        </span>
        <Separator orientation="vertical" className="h-5" />
        <input
          value={styleName ?? ""}
          onChange={(e) => updateStyleName(e.target.value)}
          className="h-7 border-none bg-transparent text-sm font-medium outline-none focus:ring-0"
          placeholder="Style name"
        />
        {/* Save status */}
        {styleId && (
          <span className="text-xs text-muted-foreground ml-2">
            {saveStatus === "saving" && (
              <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
            )}
            {saveStatus === "saving" && "Saving..."}
            {saveStatus === "saved" &&
              `Saved${lastSavedAt ? ` ${lastSavedAt.toLocaleTimeString()}` : ""}`}
            {saveStatus === "idle" && "Unsaved draft"}
            {saveStatus === "error" && (
              <span className="text-destructive">Save failed</span>
            )}
            {saveStatus === "conflict" && (
              <span className="text-destructive">Version conflict</span>
            )}
          </span>
        )}
        <div className="flex-1" />
        {styleId && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => saveStyle().catch(() => {})}
              disabled={saveStatus === "saving"}
              title="Save (Ctrl+S)"
            >
              <Save className="h-3 w-3" />
              Save
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={isPublic ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  title="Publish and copy style URLs"
                >
                  {isPublic ? (
                    <Globe className="h-3 w-3" />
                  ) : (
                    <GlobeLock className="h-3 w-3" />
                  )}
                  {isPublic ? "Published" : "Draft"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3" align="end">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Publish workflow</p>
                    <p className="text-xs text-muted-foreground">
                      Keep editing in draft, publish when ready, or copy a
                      version-pinned link.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="w-full justify-start gap-2 text-xs"
                    variant={isPublic ? "outline" : "default"}
                    onClick={handlePublishToggle}
                    disabled={publishing}
                    data-testid="publish-style"
                  >
                    {publishing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isPublic ? (
                      <Globe className="h-3 w-3" />
                    ) : (
                      <Globe className="h-3 w-3" />
                    )}
                    {isPublic ? "Publish latest changes" : "Publish style"}
                  </Button>
                  <div className="grid gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 justify-start gap-2 text-xs"
                      onClick={() => copyUrl("Draft", draftUrl())}
                    >
                      {copiedUrl === "Draft" ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Link className="h-3 w-3" />
                      )}
                      Copy draft editor URL
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 justify-start gap-2 text-xs"
                      disabled={!isPublic || !ownerHandle || !publishedVersion}
                      onClick={() =>
                        copyUrl("Version", publicUrl(publishedVersion))
                      }
                    >
                      {copiedUrl === "Version" ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Link className="h-3 w-3" />
                      )}
                      Copy published v{publishedVersion ?? "latest"} URL
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 justify-start gap-2 text-xs"
                      disabled={!isPublic || !ownerHandle}
                      onClick={() => copyUrl("Published", publicUrl())}
                      data-testid="style-public-url"
                    >
                      {copiedUrl === "Published" ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Globe className="h-3 w-3" />
                      )}
                      Copy published JSON URL
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 justify-start gap-2 text-xs"
                      disabled={!isPublic || !ownerHandle}
                      onClick={() => copyUrl("MapLibre", mapLibreSnippet())}
                    >
                      {copiedUrl === "MapLibre" ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Code2 className="h-3 w-3" />
                      )}
                      Copy MapLibre snippet
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <VersionHistoryButton />
          </>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={undo}
          disabled={!canUndo()}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={redo}
          disabled={!canRedo()}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <Button
          variant={inspectMode ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setInspectMode(!inspectMode)}
          title="Toggle inspect mode"
        >
          <MousePointerClick className="h-3 w-3" />
          Inspect
        </Button>
        <Button
          variant={showValidation ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setShowValidation(!showValidation)}
          title="Toggle validation panel"
        >
          <AlertTriangle className="h-3 w-3" />
          Validate
        </Button>
        <Button
          variant={showJson ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setShowJson(!showJson)}
          title="Toggle JSON editor"
        >
          <Code2 className="h-3 w-3" />
          JSON
        </Button>
        <Separator orientation="vertical" className="h-5" />

        {/* Open from URL */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              title="Open style from URL"
            >
              <Link className="h-3 w-3" />
              URL
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-2" align="end">
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Load a MapLibre style from a URL
              </p>
              <div className="flex gap-1">
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/style.json"
                  className="h-7 text-xs flex-1"
                  onKeyDown={(e) => e.key === "Enter" && handleLoadFromUrl()}
                />
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleLoadFromUrl}
                  disabled={urlLoading}
                >
                  {urlLoading ? "..." : "Load"}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handleImport}
        >
          <Upload className="h-3 w-3" />
          Import
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handleExport}
        >
          <Download className="h-3 w-3" />
          Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handleCopyToClipboard}
          title="Copy style JSON to clipboard"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <ClipboardCopy className="h-3 w-3" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </header>

      {/* Main editor area */}
      <ResizablePanelGroup
        id="style-editor-panels-v2"
        orientation="horizontal"
        defaultLayout={{
          "style-editor-left": 20,
          "style-editor-map": 56,
          "style-editor-properties": 24,
        }}
        className="flex-1 overflow-hidden"
      >
        {/* Left panel — Layers + Sources + Settings */}
        <ResizablePanel
          id="style-editor-left"
          defaultSize="20%"
          minSize="12rem"
          maxSize="26rem"
          className="flex min-w-0 flex-col border-r bg-background"
        >
          <aside className="flex h-full min-w-0 flex-col">
            <div className="mx-2 mt-1 flex h-7 rounded-lg bg-muted p-[3px] text-muted-foreground">
              <Button
                type="button"
                variant={leftPanelTab === "layers" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 flex-1 rounded-md px-1.5 text-xs"
                onClick={() => setLeftPanelTab("layers")}
              >
                Layers ({style.layers.length})
              </Button>
              <Button
                type="button"
                variant={leftPanelTab === "sources" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 flex-1 rounded-md px-1.5 text-xs"
                onClick={() => setLeftPanelTab("sources")}
              >
                Sources ({Object.keys(style.sources).length})
              </Button>
              <Button
                type="button"
                variant={leftPanelTab === "settings" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 w-8 rounded-md px-1.5 text-xs"
                onClick={() => setLeftPanelTab("settings")}
                aria-label="Style settings"
                title="Style settings"
              >
                <Settings className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex-1 overflow-hidden text-sm outline-none">
              {leftPanelTab === "layers" && (
                <div className="h-full overflow-hidden">
                  <LayerList />
                </div>
              )}
              {leftPanelTab === "sources" && (
                <div className="h-full overflow-hidden">
                  <SourcePanel />
                </div>
              )}
              {leftPanelTab === "settings" && (
                <div className="h-full overflow-hidden">
                  <StyleSettingsPanel />
                </div>
              )}
            </div>
          </aside>
        </ResizablePanel>
        <ResizableHandle withHandle />

        {/* Map + optional JSON/Validation panel */}
        <ResizablePanel
          id="style-editor-map"
          defaultSize="56%"
          minSize="20rem"
          className="min-w-0"
        >
          <main className="flex h-full min-w-0 flex-col">
            <div
              className={
                showJson || showValidation ? "flex-1 basis-1/2" : "flex-1"
              }
            >
              <MapPreview inspectMode={inspectMode} />
            </div>
            {(showJson || showValidation) && (
              <div className="basis-1/2 border-t flex">
                {showJson && (
                  <div
                    className={showValidation ? "flex-1 border-r" : "flex-1"}
                  >
                    <JsonEditor />
                  </div>
                )}
                {showValidation && (
                  <div className={showJson ? "w-72" : "flex-1"}>
                    <ValidationPanel />
                  </div>
                )}
              </div>
            )}
          </main>
        </ResizablePanel>
        <ResizableHandle withHandle />

        {/* Right panel — Properties */}
        <ResizablePanel
          id="style-editor-properties"
          defaultSize="24%"
          minSize="14rem"
          maxSize="28rem"
          className="min-w-0 border-l bg-background"
        >
          <aside className="h-full min-w-0">
            <PropertyPanel />
          </aside>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
