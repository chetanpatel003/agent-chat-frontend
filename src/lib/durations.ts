/** "42s", "3m 05s" from whole seconds. */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * A measured duration for display ("4s", "3m 12s"; anything under a second
 * shows as "1s"), or null when the value is missing or not a valid
 * non-negative number — callers then show nothing rather than a guess.
 */
export function formatDurationMs(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return null;
  return formatElapsed(Math.max(1, Math.round(ms / 1000)));
}
