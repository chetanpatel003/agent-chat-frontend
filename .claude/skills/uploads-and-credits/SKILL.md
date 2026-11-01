---
name: uploads-and-credits
description: Implement or verify Transloadit Community uploads, Uppy/tus attachment persistence, credit ledger and exactly-once settlement.
---
# Uploads
- Use Transloadit Community plan only; no paid upgrade or overage.
- Use Uppy with Transloadit integration and tus resumable uploads for image/video/audio.
- Backend creates signed Assembly parameters; Transloadit secret stays server-side.
- Persist assembly ID, status, sanitized metadata, result URLs and attachment ownership in PostgreSQL.
- Support multiple files, stable ordering, progress, cancellation, retry and reconnect.
- Enforce app MIME/type/count limits plus assessment plan caps: 5 GB monthly allowance and 0.5 GB per file. Verify current plan limits before hard-coding.
- Handle quota exhaustion, invalid file, interrupted upload, failed Assembly, duplicate completion and temporary-result expiry.
- Community plan watermarking/trimming is acceptable per assessment.

# Credits
- Maintain an append-only ledger and derive/maintain balance transactionally.
- OpenRouter model usage is recorded at zero application credits.
- Billable tool usage settles exactly once using a unique idempotency key.
- Block new work when balance is insufficient.
- On mid-turn exhaustion, stop safely, settle completed billable work and preserve partial output.
- Test duplicate settlement, concurrent charges, insufficient balance and partial failure.
