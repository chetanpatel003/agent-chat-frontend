"use client";

import { useState } from "react";
import { FileVideo, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMediaLibrary } from "@/hooks/use-media-library";
import { libraryName } from "@/hooks/use-composer-attachments";
import type { AttachmentResponse } from "@/lib/api/contracts";

const CREATED_FORMAT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function formatCreated(iso: string): string {
  return CREATED_FORMAT.format(new Date(iso));
}

function Thumbnail({ item }: { item: AttachmentResponse }) {
  const [broken, setBroken] = useState(false);
  if (item.mimeType.startsWith("video/")) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
        <FileVideo className="size-7" aria-hidden="true" />
      </div>
    );
  }
  if (!item.url || broken) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
        <ImageOff className="size-6" aria-hidden="true" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; no image optimizer
  return <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setBroken(true)} />;
}

/**
 * Picks existing media (files sent earlier, images/videos the agent
 * generated) to attach to the next message. Selection order is the order
 * they are added to the composer, after anything already there.
 */
export function MediaPicker({
  open,
  onOpenChange,
  addedIds,
  remaining,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Attachment ids already in the composer. */
  addedIds: ReadonlySet<string>;
  /** How many more attachments this message can take. */
  remaining: number;
  onAdd: (picks: AttachmentResponse[]) => void;
}) {
  const library = useMediaLibrary(open);
  const [selected, setSelected] = useState<AttachmentResponse[]>([]);
  const items = library.data?.pages.flatMap((page) => page.items) ?? [];

  const close = (next: boolean) => {
    if (!next) setSelected([]);
    onOpenChange(next);
  };
  const toggle = (item: AttachmentResponse) =>
    setSelected((current) =>
      current.some((s) => s.id === item.id) ? current.filter((s) => s.id !== item.id) : [...current, item],
    );

  let body: React.ReactNode;
  if (library.isPending) {
    body = (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Loading media" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-square w-full" />
        ))}
      </div>
    );
  } else if (library.isError) {
    body = (
      <div role="alert" className="flex flex-col items-center gap-2 py-8 text-center text-sm">
        <p className="text-destructive">Couldn&apos;t load your media.</p>
        <Button variant="outline" size="sm" onClick={() => void library.refetch()}>
          Try again
        </Button>
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No media yet. Files you send and images or videos the agent creates will appear here.
      </p>
    );
  } else {
    body = (
      <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto">
        <ul aria-label="Media library" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((item) => {
            // Unnamed items (generated outputs) share a generic name; their
            // creation time tells them apart without relying on the thumbnail.
            const created = item.metadata.filename ? null : formatCreated(item.createdAt);
            const name = created ? `${libraryName(item)}, ${created}` : libraryName(item);
            const added = addedIds.has(item.id);
            const unavailable = item.url === null;
            const position = selected.findIndex((s) => s.id === item.id);
            const isSelected = position >= 0;
            const full = !isSelected && selected.length >= remaining;
            const state = added ? "Already added" : unavailable ? "Unavailable" : null;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={state ? `${name} (${state})` : name}
                  disabled={added || unavailable || full}
                  onClick={() => toggle(item)}
                  className={cn(
                    "relative flex w-full flex-col overflow-hidden rounded-lg border text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                    isSelected ? "border-primary ring-2 ring-primary" : "border-border",
                    (added || unavailable || full) && "opacity-50",
                  )}
                >
                  <div className="aspect-square w-full">
                    <Thumbnail item={item} />
                  </div>
                  <span className="truncate px-1.5 py-1" title={name}>
                    {state ?? name}
                  </span>
                  {isSelected && (
                    <span
                      aria-hidden="true"
                      className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground"
                    >
                      {position + 1}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {library.hasNextPage && (
          <Button
            variant="ghost"
            size="sm"
            className="self-center"
            disabled={library.isFetchingNextPage}
            onClick={() => void library.fetchNextPage()}
          >
            {library.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        )}
        {library.isFetchNextPageError && (
          <p role="alert" className="text-center text-xs text-destructive">
            Couldn&apos;t load more media.
          </p>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Media library</DialogTitle>
          <DialogDescription>
            {remaining > 0
              ? `Choose up to ${remaining} more for this message. They're attached in the order you pick them.`
              : "This message already has the maximum number of attachments."}
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            disabled={selected.length === 0}
            onClick={() => {
              onAdd(selected);
              close(false);
            }}
          >
            {selected.length > 0 ? `Add ${selected.length}` : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
