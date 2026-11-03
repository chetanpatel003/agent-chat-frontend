"use client";

import { FileVideo, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComposerAttachment } from "@/hooks/use-composer-attachments";

const STATUS_LABEL: Record<ComposerAttachment["status"], string> = {
  uploading: "Uploading",
  ready: "Uploaded",
  failed: "Upload failed",
  cancelled: "Cancelled",
  rejected: "Not allowed",
};

export function ComposerAttachments({
  items,
  onCancel,
  onRetry,
  onRemove,
}: {
  items: ComposerAttachment[];
  onCancel: (localId: string) => void;
  onRetry: (localId: string) => void;
  onRemove: (localId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul aria-label="Attachments" className="mb-2 flex flex-wrap gap-2">
      {items.map((item) => {
        const problem = item.status === "failed" || item.status === "cancelled" || item.status === "rejected";
        return (
          <li
            key={item.localId}
            aria-label={`${item.name}: ${item.origin === "library" ? "From media library" : STATUS_LABEL[item.status]}`}
            data-status={item.status}
            className={cn(
              "relative flex w-24 flex-col overflow-hidden rounded-lg border bg-muted text-xs",
              problem && "border-destructive/60",
            )}
          >
            <div className="relative h-16 w-full">
              {item.previewUrl && item.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL or signed library URL
                <img src={item.previewUrl} alt="" className={cn("h-full w-full object-cover", problem && "opacity-40")} />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <FileVideo className="size-6" aria-hidden="true" />
                </div>
              )}
              {item.status === "uploading" && (
                <div
                  role="progressbar"
                  aria-label={`Uploading ${item.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(item.progress * 100)}
                  className="absolute inset-x-0 bottom-0 h-1 bg-background/60"
                >
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${item.progress * 100}%` }} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 px-1.5 py-1">
              <span className="min-w-0 flex-1 truncate" title={item.name}>
                {item.error ?? (item.status === "uploading" ? `${Math.round(item.progress * 100)}%` : item.name)}
              </span>
              {(item.status === "failed" || item.status === "cancelled") && (
                <button type="button" aria-label={`Retry upload of ${item.name}`} onClick={() => onRetry(item.localId)}>
                  <RotateCw className="size-3.5" aria-hidden="true" />
                </button>
              )}
              {item.status === "uploading" ? (
                <button type="button" aria-label={`Cancel upload of ${item.name}`} onClick={() => onCancel(item.localId)}>
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ) : (
                <button type="button" aria-label={`Remove ${item.name}`} onClick={() => onRemove(item.localId)}>
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
            {item.status === "cancelled" && <span className="px-1.5 pb-1 text-muted-foreground">Cancelled</span>}
          </li>
        );
      })}
    </ul>
  );
}
