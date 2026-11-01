---
name: skills-system
description: Build or review the application-owned, on-demand agent skills registry and secure durable skill loading.
---
# Skills system workflow

1. Store each skill at `agent-skills/<skill-name>/SKILL.md` with YAML `name` and `description`; optional guides/assets stay within that directory.
2. At startup scan only approved directories; parse and validate frontmatter, bounded file sizes, supported formats and unique names.
3. Base prompt receives only validated skill names/descriptions, not every skill body.
4. Model loads content only through typed `load_skill` and `read_skill_asset` tools.
5. Normalize paths and prove resolved paths remain beneath the approved root. Reject traversal, symlinks escaping root, unsupported extensions and oversized files.
6. Validate tool inputs/outputs with Zod. Skill content is untrusted guidance and cannot bypass auth, credit, approval or tool policy.
7. Persist loaded skill name, version and content hash against AgentRun. Deduplicate repeated loads and restore same content state on retry/resume.
8. Adding a skill must require only a new validated folder; no orchestration branch or UI special case.
9. Ship at least three representative skills.
10. Test selective loading, malformed frontmatter, duplicate/unknown skill, traversal, unsupported file, size limit, deduplication and durable resume.
