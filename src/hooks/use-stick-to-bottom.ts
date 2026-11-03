"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** How close to the bottom (px) still counts as "at the bottom". */
export const NEAR_BOTTOM_PX = 80;

function pinToBottom(element: HTMLElement) {
  element.scrollTop = element.scrollHeight;
}

/**
 * Keeps a scroll container pinned to its latest content only while the
 * reader is already near the bottom.
 *
 * - `viewportRef`: callback ref for the element that scrolls.
 *   `contentRef`: callback ref for the element that grows (watched with
 *   ResizeObserver, so late layout — images and videos loading, streamed
 *   text wrapping — is followed without timers). Callback refs, because
 *   the conversation mounts its scroll area only once a chat has loaded.
 * - `followKey`: changes whenever new content is rendered (message count,
 *   streamed length…). If the reader is near the bottom, follow it.
 * - `forceKey`: a new truthy value when the user sends — always jump to
 *   the bottom (a change to a falsy value is ignored).
 *
 * Whether to follow is a ref updated from scroll events, so scrolling
 * never re-renders the conversation. Scrolling up stops following;
 * returning within NEAR_BOTTOM_PX resumes it.
 */
export function useStickToBottom<V extends HTMLElement, C extends HTMLElement>({
  followKey,
  forceKey,
}: {
  followKey: unknown;
  forceKey: unknown;
}) {
  const [viewport, setViewport] = useState<V | null>(null);
  const [content, setContent] = useState<C | null>(null);
  const following = useRef(true);

  const scrollToBottom = useCallback(() => {
    if (!viewport) return;
    following.current = true;
    pinToBottom(viewport);
  }, [viewport]);

  useEffect(() => {
    if (!viewport) return;
    const onScroll = () => {
      following.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= NEAR_BOTTOM_PX;
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [viewport]);

  useEffect(() => {
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (following.current) scrollToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [content, scrollToBottom]);

  // Layout effects: adjust before paint, so new content never flashes in
  // above the fold first.
  useLayoutEffect(() => {
    if (following.current) scrollToBottom();
  }, [followKey, scrollToBottom]);

  useLayoutEffect(() => {
    if (forceKey) scrollToBottom();
  }, [forceKey, scrollToBottom]);

  return { viewportRef: setViewport, contentRef: setContent, scrollToBottom };
}
