"use client";

import { memo } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * The one renderer for assistant prose: streamed, completed, failed,
 * interrupted and recovered messages, and text around tool results.
 *
 * Safety (model output is untrusted):
 * - Raw HTML is never rendered: no rehype-raw plugin, and `skipHtml` drops
 *   HTML nodes entirely, so `<script>`, `<img onerror>` and so on never
 *   reach the DOM.
 * - Link URLs go through react-markdown's default transform (only http(s),
 *   mailto, tel and relative URLs survive; `javascript:` and `data:` are
 *   dropped). Links open in a new tab with `noopener noreferrer`.
 * - Markdown images are never loaded: model text must not make the browser
 *   fetch arbitrary URLs (generated media renders from tool results only).
 *   An image shows as its alt text.
 */
const components: Components = {
  h1: ({ node: _node, className, ...props }) => <h3 className={cn("mt-1 text-base font-semibold", className)} {...props} />,
  h2: ({ node: _node, className, ...props }) => <h3 className={cn("mt-1 text-base font-semibold", className)} {...props} />,
  h3: ({ node: _node, className, ...props }) => <h4 className={cn("mt-1 text-sm font-semibold", className)} {...props} />,
  h4: ({ node: _node, className, ...props }) => <h5 className={cn("text-sm font-semibold", className)} {...props} />,
  h5: ({ node: _node, className, ...props }) => <h6 className={cn("text-sm font-medium", className)} {...props} />,
  h6: ({ node: _node, className, ...props }) => <h6 className={cn("text-sm font-medium", className)} {...props} />,
  p: ({ node: _node, className, ...props }) => <p className={cn("whitespace-pre-wrap", className)} {...props} />,
  ul: ({ node: _node, className, ...props }) => <ul className={cn("list-disc space-y-1 pl-5", className)} {...props} />,
  ol: ({ node: _node, className, ...props }) => <ol className={cn("list-decimal space-y-1 pl-5", className)} {...props} />,
  blockquote: ({ node: _node, className, ...props }) => (
    <blockquote className={cn("border-l-2 border-border pl-3 text-muted-foreground", className)} {...props} />
  ),
  a: ({ node: _node, className, href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={cn("underline underline-offset-2 break-words", className)}
      {...props}
    />
  ),
  // Fenced blocks: <pre><code class="language-x">; inline code: <code> alone.
  pre: ({ node: _node, className, ...props }) => (
    <pre
      className={cn("overflow-x-auto rounded-md bg-background/70 p-3 font-mono text-xs leading-relaxed [&>code]:bg-transparent [&>code]:p-0", className)}
      {...props}
    />
  ),
  code: ({ node: _node, className, ...props }) => (
    <code className={cn("rounded bg-background/70 px-1 py-0.5 font-mono text-[0.85em]", className)} {...props} />
  ),
  table: ({ node: _node, className, ...props }) => (
    <div className="overflow-x-auto">
      <table className={cn("border-collapse text-xs", className)} {...props} />
    </div>
  ),
  th: ({ node: _node, className, ...props }) => <th className={cn("border border-border px-2 py-1 text-left font-semibold", className)} {...props} />,
  td: ({ node: _node, className, ...props }) => <td className={cn("border border-border px-2 py-1", className)} {...props} />,
  hr: ({ node: _node, className, ...props }) => <hr className={cn("border-border", className)} {...props} />,
  img: ({ alt }) => <span data-markdown-image="">{alt || "image"}</span>,
};

function urlTransform(url: string, key: string): string | null | undefined {
  if (key === "src") return null; // images are never fetched (see above)
  return defaultUrlTransform(url);
}

export const AssistantMarkdown = memo(function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div data-markdown="" className="flex min-w-0 flex-col gap-2 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
});
