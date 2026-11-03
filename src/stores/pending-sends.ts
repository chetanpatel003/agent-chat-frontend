import { create } from "zustand";

/** What the user sees of a message they just sent, before the server has it. */
export type PendingSend = {
  localId: string;
  chatId: string;
  text: string;
  /** Chips in send order (uploads and media-library picks). */
  attachments: { id: string; name: string; kind: "image" | "video" }[];
  /** Set once admission succeeds: the persisted message's id. The entry is hidden as soon as
   * the messages query contains that id, and removed after the reconciling refetch. */
  serverMessageId: string | null;
};

type PendingSendsState = {
  sends: PendingSend[];
  add: (send: PendingSend) => void;
  admitted: (localId: string, serverMessageId: string) => void;
  remove: (localId: string) => void;
};

/**
 * Optimistic user messages (ephemeral UI state, never persisted). Kept
 * outside the TanStack messages cache on purpose: realtime-triggered
 * refetches replace that cache wholesale and would drop an optimistic
 * entry mid-admission, making the message flicker out and back in.
 */
export const usePendingSends = create<PendingSendsState>((set) => ({
  sends: [],
  add: (send) => set((s) => ({ sends: [...s.sends, send] })),
  admitted: (localId, serverMessageId) =>
    set((s) => ({ sends: s.sends.map((p) => (p.localId === localId ? { ...p, serverMessageId } : p)) })),
  remove: (localId) => set((s) => ({ sends: s.sends.filter((p) => p.localId !== localId) })),
}));

/** Pending sends for one chat that the server list doesn't contain yet (never a duplicate). */
export function visiblePendingSends(sends: PendingSend[], chatId: string, serverIds: ReadonlySet<string>): PendingSend[] {
  return sends.filter((p) => p.chatId === chatId && !(p.serverMessageId && serverIds.has(p.serverMessageId)));
}
