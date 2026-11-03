import type { ToolDisplay } from "@/lib/api/contracts";

/** Same neutral fallback as the backend's tools/display.ts, for events or blocks without a display. */
export function fallbackToolDisplay(toolName: string): ToolDisplay {
  const words = toolName.replace(/[_-]+/g, " ").trim() || "tool";
  return { name: words.charAt(0).toUpperCase() + words.slice(1), activity: `Running ${words}` };
}
