import { cn } from "@planisfy/ui/lib/utils";

export function StyleStatusBadge({
  isPublic,
  className,
}: {
  isPublic: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        isPublic
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {isPublic ? "Public" : "Draft"}
    </span>
  );
}
