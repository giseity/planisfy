"use client";

import type React from "react";
import { Badge } from "@planisfy/ui/components/badge";
import { Label } from "@planisfy/ui/components/label";
import { TableCell, TableRow } from "@planisfy/ui/components/table";
import { toast } from "sonner";

export function Field({
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

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const variant =
    normalized.includes("fail") ||
    normalized.includes("error") ||
    normalized === "offline"
      ? "destructive"
      : normalized.includes("healthy") ||
          normalized.includes("success") ||
          normalized.includes("complete")
        ? "default"
        : "secondary";
  return <Badge variant={variant}>{status.replaceAll("_", " ")}</Badge>;
}

export function EmptyRow({
  colSpan,
  label,
}: {
  colSpan: number;
  label: string;
}) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className="h-20 text-center text-sm text-muted-foreground"
      >
        {label}
      </TableCell>
    </TableRow>
  );
}

export async function runAction<T>(
  action: () => Promise<T>,
  message: string,
  onDone: () => void,
) {
  try {
    await action();
    toast.success(message);
    onDone();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Operation failed");
  }
}
