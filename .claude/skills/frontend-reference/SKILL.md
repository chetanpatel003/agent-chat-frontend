---
name: frontend-reference
description: Implement or refine the Galaxy Agent Chat frontend against the live product reference, with responsive behavior and accessible interaction states.
---
# Frontend reference workflow

1. Inspect the live reference at `https://app.galaxy.ai/chat` and compare the same states in the local build. Do not invent a new design.
2. Capture a short checklist for shell, sidebar, composer, message widths, typography, spacing, tool cards, approval overlays, artifact panel, credit flow, empty/loading/error states and responsive layout.
3. Build reusable components from repeated visual patterns; avoid premature component frameworks.
4. Use centralized typed API services + TanStack Query for server state; Zustand for local UI state only.
5. Model message content as ordered typed blocks; preserve ordering through stream updates and persisted readback.
6. Keep composer pinned, keyboard-operable and usable on mobile. Add focus management and accessible labels.
7. Distinguish thinking/status, active tool, completed tool, failed tool, approval required, generated asset, cancelled and retry states.
8. Realtime events update the UI, but REST readback reconciles after reload/disconnect.
9. Never display fake provider success, invented credits, or fabricated progress.
10. Verify at common desktop/mobile widths and use Playwright for critical flows. Prioritize reference fidelity over decorative polish.
