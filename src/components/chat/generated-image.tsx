"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

export function GeneratedImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground"
      >
        <ImageOff className="size-4 shrink-0" aria-hidden="true" />
        Image failed to load
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- provider CDN hosts aren't configured for next/image, and proxying third-party media through the optimizer isn't wanted
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="block h-auto max-w-full rounded-lg"
    />
  );
}
