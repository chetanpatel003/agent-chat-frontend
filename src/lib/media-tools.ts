/** Billable Magica tools whose successful results render as media (and carry settled usage). */
export const IMAGE_TOOLS: ReadonlySet<string> = new Set(["generate_image", "edit_image", "crop_image"]);
export const VIDEO_TOOLS: ReadonlySet<string> = new Set(["merge_videos"]);
export const MEDIA_TOOLS: ReadonlySet<string> = new Set([...IMAGE_TOOLS, ...VIDEO_TOOLS]);
