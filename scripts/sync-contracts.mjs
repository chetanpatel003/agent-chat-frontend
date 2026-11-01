#!/usr/bin/env node
// Copies the backend's authoritative Zod contracts into this repo so the
// frontend validates with the real runtime schemas, not hand-duplicated
// types. Two repos, no monorepo: this is the "practical contract-
// generation approach" the checkpoint allows in place of one.
//
// Assumes the backend repo is checked out as a sibling directory (override
// with BACKEND_REPO_PATH). Re-run after any backend contract change —
// there's no watcher; this is a deliberate, visible step, not magic.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot =
  process.env.BACKEND_REPO_PATH ?? join(here, "../../agent-chat-backend");
const backendContracts = join(backendRoot, "src/contracts");
const backendEnums = join(backendRoot, "src/generated/prisma/enums.ts");
const outDir = join(here, "../src/lib/api/contracts");

const HEADER = `// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run \`pnpm sync:contracts\` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

`;

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const files = readdirSync(backendContracts).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
);

for (const file of files) {
  let contents = readFileSync(join(backendContracts, file), "utf8");
  contents = contents.replace(
    '"@/generated/prisma/enums"',
    '"./prisma-enums"',
  );
  writeFileSync(join(outDir, file), HEADER + contents);
}

// The one piece of backend-generated code the contracts depend on: the
// Prisma enum const-objects. Copied verbatim, not reimplemented, so the
// allowed values can never drift from what the backend actually has.
const enumsSource = readFileSync(backendEnums, "utf8");
writeFileSync(join(outDir, "prisma-enums.ts"), HEADER + enumsSource);

console.log(`Synced ${files.length} contract file(s) + prisma-enums.ts to ${outDir}`);
