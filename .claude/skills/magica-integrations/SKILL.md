---
name: magica-integrations
description: Implement, test or debug the three mandatory real Magica integrations: Crop Image, GPT Image 2 and Merge Videos.
---
# Magica integration workflow

## Shared adapter contract
- Server-to-server only; `MAGICA_API_KEY` never enters browser code, model prompts, logs or persisted message content.
- Base URL is environment-configurable; do not hard-code environment host.
- Submit `POST /v1/nodes/{nodeType}/run` with `Authorization: Bearer <key>`.
- Persist returned `runId` immediately; reconcile using `GET /v1/nodes/runs/{runId}`.
- Validate input and provider response with Zod. Persist sanitized input, runId, status, duration, credit usage, result URL and safe error.
- Handle 401, 429, timeout, provider failure, malformed response, duplicate dispatch, reconnect, retry and reload recovery.
- Long-running provider work runs as typed Trigger.dev child tasks.
- Never stub the three required successful paths.

## Crop Image
- `nodeType: crop_image`.
- Accept `image_url` and one supported rectangle representation: percent coordinates, exact pixel coordinates, or `crop.{x,y,width,height}`.
- Reject incomplete, non-finite, out-of-bounds or non-positive rectangles.
- Render validated returned `image_url` as a generated asset.

## GPT Image 2
- `nodeType: gpt_image_2`.
- Support `gpt-image-2-text` for generation and `gpt-image-2-edit` when modifying a supplied image.
- Resolve current fields from Magica model catalog/schema at implementation time; do not duplicate stale provider schema.
- Persist/render generated output and recover it after reload.

## Merge Videos
- `nodeType: merge_videos`.
- Accept 2–100 ordered `video_urls`.
- Support `none`, `fade`, `dissolve`.
- Preserve input order and render returned `video_url`.

## Agent behavior and acceptance
- Register all three in the single typed tool registry.
- Agent chooses based on intent without a manual model selector.
- Support chaining, e.g. generate image then crop.
- Demonstrate one successful conversation per tool plus one chained conversation.
- Fixtures may test failures, but not replace real success calls.
