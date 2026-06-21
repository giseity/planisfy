"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent, ReactNode } from "react";
import { Button } from "@planisfy/ui/components/button";
import { cn } from "@planisfy/ui/lib/utils";
import {
  AlertCircle,
  Database,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileUp,
  X,
} from "lucide-react";

export function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 Bytes";

  const units = ["Bytes", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;

  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 10 || index === 0 ? 0 : 1,
  })} ${units[index]}`;
}

function getFileExtension(fileName: string) {
  return fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
}

function isAcceptedFile(file: File, accept: string) {
  if (!accept || accept === "*") return true;

  const acceptedTypes = accept.split(",").map((type) => type.trim());
  const extension = getFileExtension(file.name);

  return acceptedTypes.some((acceptedType) => {
    if (acceptedType.startsWith(".")) {
      return extension === acceptedType.toLowerCase();
    }

    if (acceptedType.endsWith("/*")) {
      return file.type.startsWith(acceptedType.replace("*", ""));
    }

    return file.type === acceptedType;
  });
}

function defaultFileIcon(file: File) {
  const extension = getFileExtension(file.name);

  if (file.type.startsWith("image/")) {
    return <FileImage className="size-4 opacity-60" />;
  }

  if (extension === ".zip") {
    return <FileArchive className="size-4 opacity-60" />;
  }

  if (extension === ".csv") {
    return <FileSpreadsheet className="size-4 opacity-60" />;
  }

  if (extension === ".pmtiles" || extension === ".mbtiles") {
    return <Database className="size-4 opacity-60" />;
  }

  return <FileText className="size-4 opacity-60" />;
}

export function FileDropzone({
  id,
  file = null,
  onFileChange,
  onFileAccepted,
  accept,
  acceptedLabel,
  maxSizeBytes,
  title = "Upload file",
  description = "Drag and drop a file here, or click to browse",
  emptyIcon = <FileUp className="size-4 opacity-60" />,
  renderFileIcon = defaultFileIcon,
  disabled = false,
  variant = "default",
  showSelectedFile = true,
  className,
}: {
  id: string;
  file?: File | null;
  onFileChange?: (file: File | null) => void;
  onFileAccepted?: (file: File) => void | Promise<void>;
  accept: string;
  acceptedLabel: string;
  maxSizeBytes: number;
  title?: string;
  description?: string;
  emptyIcon?: ReactNode;
  renderFileIcon?: (file: File) => ReactNode;
  disabled?: boolean;
  variant?: "default" | "compact";
  showSelectedFile?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file && inputRef.current) {
      inputRef.current.value = "";
    }
  }, [file]);

  function clearInput() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function openFileDialog() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function selectFile(nextFile: File | null) {
    setError(null);

    if (!nextFile) {
      onFileChange?.(null);
      clearInput();
      return;
    }

    if (!isAcceptedFile(nextFile, accept)) {
      setError(`Choose a ${acceptedLabel} file.`);
      onFileChange?.(null);
      clearInput();
      return;
    }

    if (nextFile.size > maxSizeBytes) {
      setError(
        `File is too large. Uploads are limited to ${formatFileSize(maxSizeBytes)}.`,
      );
      onFileChange?.(null);
      clearInput();
      return;
    }

    onFileChange?.(nextFile);
    void onFileAccepted?.(nextFile);
    if (!showSelectedFile) {
      clearInput();
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0] ?? null);
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) setIsDragging(true);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length > 1) {
      setError("Only one file can be uploaded at a time.");
      onFileChange?.(null);
      clearInput();
      return;
    }

    selectFile(files[0] ?? null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFileDialog();
    }
  }

  function removeFile() {
    setError(null);
    onFileChange?.(null);
    clearInput();
  }

  const visibleFile = showSelectedFile ? file : null;
  const isCompact = variant === "compact";

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-describedby={error ? `${id}-help ${id}-error` : `${id}-help`}
        className="hidden"
        onChange={handleInputChange}
      />
      <p id={`${id}-help`} className="sr-only">
        {acceptedLabel}. Up to {formatFileSize(maxSizeBytes)}.
      </p>
      <div
        role={visibleFile ? undefined : "button"}
        tabIndex={visibleFile || disabled ? -1 : 0}
        data-dragging={isDragging}
        aria-disabled={disabled}
        aria-label={visibleFile ? undefined : title}
        onClick={visibleFile ? undefined : openFileDialog}
        onKeyDown={visibleFile ? undefined : handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-input bg-input/40 text-center transition-colors",
          "hover:border-ring/60 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "data-[dragging=true]:border-ring data-[dragging=true]:bg-accent/50",
          isCompact ? "min-h-20 px-3 py-3" : "min-h-40 px-4 py-5",
          visibleFile && "cursor-default",
          disabled &&
            "cursor-not-allowed opacity-60 hover:border-input hover:bg-input/40",
        )}
      >
        {visibleFile ? (
          <div className="w-full max-w-md rounded-lg border bg-background px-3 py-2 text-left">
            <div className="flex items-center gap-3">
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted"
                aria-hidden="true"
              >
                {renderFileIcon(visibleFile)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {visibleFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(visibleFile.size)}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={disabled}
                aria-label="Remove selected file"
                onClick={(event) => {
                  event.stopPropagation();
                  removeFile();
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex max-w-md flex-col items-center justify-center">
            <div
              className={cn(
                "flex shrink-0 items-center justify-center rounded-full border bg-background",
                isCompact ? "mb-2 size-8" : "mb-3 size-11",
              )}
              aria-hidden="true"
            >
              {emptyIcon}
            </div>
            <p className={cn("font-medium", isCompact ? "text-xs" : "text-sm")}>
              {title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-1 text-xs text-muted-foreground/70">
              <span>{acceptedLabel}</span>
              <span aria-hidden="true">.</span>
              <span>Up to {formatFileSize(maxSizeBytes)}</span>
            </div>
          </div>
        )}
      </div>
      {error && (
        <p
          id={`${id}-error`}
          className="flex items-center gap-1.5 text-xs text-destructive"
        >
          <AlertCircle className="size-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}
