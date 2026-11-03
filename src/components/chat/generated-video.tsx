"use client";

import { useState } from "react";
import { VideoOff } from "lucide-react";

/** A generated video (e.g. merge_videos output), played inline with native controls. */
export function GeneratedVideo({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground"
      >
        <VideoOff className="size-4 shrink-0" aria-hidden="true" />
        Video failed to load
      </div>
    );
  }

  return (
    <video
      src={src}
      controls
      preload="metadata"
      playsInline
      aria-label={label}
      onError={() => setFailed(true)}
      className="block h-auto max-w-full rounded-lg"
    />
  );
}
