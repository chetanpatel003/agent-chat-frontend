// AUTO-SYNCED from the backend repo's src/contracts/ — do not edit here.
// Re-run `pnpm sync:contracts` after a backend contract change.
// Source: agent-chat-backend/src/contracts (see scripts/sync-contracts.mjs)

// Display/context sanitization for assistant prose. Shared by the backend
// (API responses, model context) and — via contract sync — the frontend
// (persisted and live-streamed text), so both apply the same rule.
//
// Why: generated media is rendered by the app from tool results. The model
// sometimes repeats media URLs in its reply — provider result URLs, or the
// "Attached/Generated files (in order):" lists of one-hour signed storage
// URLs that conversation context gives it as tool inputs. Signed URLs carry
// a credential id and signature and must never be shown as text.

/** Hosts that serve generated media (Magica results). */
const MEDIA_HOSTS: ReadonlySet<string> = new Set(["g.tlcdn.com", "static.magica.com"]);
/** Object storage (Backblaze B2 S3 endpoints). */
const STORAGE_HOST_SUFFIX = ".backblazeb2.com";

/** A media/storage URL or any presigned URL — never shown as prose. */
export function isMediaOrSignedUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (MEDIA_HOSTS.has(host) || host.endsWith(STORAGE_HOST_SUFFIX)) return true;
  const query = url.search.toLowerCase();
  return query.includes("x-amz-signature=") || query.includes("x-amz-credential=");
}

// The context file lists (providers/conversation-context.ts), header plus
// numbered "N. mime/type url" lines.
const FILE_LIST = /^[ \t]*(?:Attached|Generated) files \(in order\):[ \t]*(?:\r?\n[ \t]*\d+\.[ \t]+\S+[ \t]+\S+[ \t]*)*/gim;
const MARKDOWN_IMAGE = /!\[[^\]\n]*\]\((https?:\/\/[^\s)]+)\)/g;
const MARKDOWN_LINK = /\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)\)/g;
const ANGLE_URL = /<(https?:\/\/[^\s>]+)>/g;
const BARE_URL = /https?:\/\/[^\s<>"'()[\]]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;
const LEFTOVER_ONLY = /^[\s\-*•:.,]*$/;
const PARTIAL_TRAILING_URL = /\bhttps?:\/\/\S*$|\bhttps?:?\/?\/?$/;

function stripLine(line: string): string {
  return line
    .replace(MARKDOWN_IMAGE, (match, url: string) => (isMediaOrSignedUrl(url) ? "" : match))
    .replace(MARKDOWN_LINK, (match, label: string, url: string) => (isMediaOrSignedUrl(url) ? label : match))
    .replace(ANGLE_URL, (match, url: string) => (isMediaOrSignedUrl(url) ? "" : match))
    .replace(BARE_URL, (match) => {
      const url = match.replace(TRAILING_PUNCTUATION, "");
      return isMediaOrSignedUrl(url) ? match.slice(url.length) : match;
    });
}

/**
 * Removes generated-media URLs, presigned URLs and the context file lists
 * from assistant text. Ordinary prose and unrelated links are kept; text
 * with nothing to remove is returned unchanged.
 *
 * `streaming`: the text is a live prefix — a URL still being received at
 * the very end is held back until it is complete (and then judged).
 */
export function stripMediaReferences(text: string, opts: { streaming?: boolean } = {}): string {
  let input = text;
  if (opts.streaming) input = input.replace(PARTIAL_TRAILING_URL, "");
  if (!/https?:|files \(in order\)/i.test(input)) return input;

  const withoutLists = input.replace(FILE_LIST, "");
  let changed = withoutLists !== input;
  const lines = withoutLists.split("\n").flatMap((line) => {
    const stripped = stripLine(line);
    if (stripped === line) return [line];
    changed = true;
    // A line that held only a removed URL (or a bullet / colon around it) goes.
    return LEFTOVER_ONLY.test(stripped) ? [] : [stripped.replace(/[ \t]{2,}/g, " ").trimEnd()];
  });
  if (!changed) return input;
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------- Credit-consumption statements ----------
// Usage is shown by the app under each generated result (from the settled
// ToolInvocation), so a model's own "It used 273936 credits." is redundant
// and unverified. Removed narrowly: only a past-tense consumption statement
// that pairs a credit amount with used/consumed/charged/spent/deducted/
// billed (or "<subject> cost N credits", or a "Credits used: N" label).
// Prices ("costs about 50,000 credits"), future costs ("will cost"),
// balances ("you have 8.9M credits left") and other numbers are kept.

/** "273936", "273,936", "0.27M", "1.2 million", "5k". */
const AMOUNT = String.raw`\d[\d,]*(?:\.\d+)?\s*(?:[kKmM]\b|million\b|thousand\b)?`;
const CREDITS = String.raw`(?:Magica\s+)?credits?\b`;
const PAST_VERB = String.raw`(?:used|consumed|charged|spent|deducted|billed|took|required)`;
const SUBJECT_COST = String.raw`\b(?:it|this|that|the\s+(?:image|images|video|videos|generation|edit|crop|merge|operation|request|result|run|call))\s+cost\b`;

const CREDIT_STATEMENT = new RegExp(
  [
    // "It used 273,936 credits", "This consumed about 0.27M credits", "charged you 5,000 credits"
    String.raw`\b${PAST_VERB}\b[^.!?\n]{0,40}?\b${AMOUNT}\s*${CREDITS}`,
    // "273,936 credits were used", "5,000 credits have been deducted"
    String.raw`\b${AMOUNT}\s*${CREDITS}[^.!?\n]{0,25}?\b${PAST_VERB}\b`,
    // "The image cost 0.27M credits" (not "costs", not "will cost")
    String.raw`${SUBJECT_COST}[^.!?\n]{0,25}?\b${AMOUNT}\s*${CREDITS}`,
    // "Credits used: 273,936", "Credit usage - 5,000"
    String.raw`\bcredits?\s+(?:used|consumed|charged|spent|usage)\s*[:\-–—]\s*${AMOUNT}`,
  ].join("|"),
  "i",
);
/** A parenthetical credit statement inside a sentence: "(273,936 credits used)". */
const CREDIT_PARENTHETICAL = /\s*\(([^()\n]{1,80})\)/g;
/** While streaming: a trailing, unfinished sentence that is heading for a credit statement. */
const PARTIAL_CREDIT_TAIL = new RegExp(
  String.raw`(?:^|(?<=[.!?]\s))[^.!?\n]*\b(?:${PAST_VERB}|cost|credits?)\b[^.!?\n]*$`,
  "i",
);

function isCreditStatement(sentence: string): boolean {
  return CREDIT_STATEMENT.test(sentence);
}

/**
 * Removes model-written credit-consumption statements, sentence by
 * sentence (a parenthetical one only loses the parenthesis). Everything
 * else is kept; text with nothing to remove is returned unchanged.
 */
export function stripCreditStatements(text: string, opts: { streaming?: boolean } = {}): string {
  let input = text;
  if (opts.streaming) {
    // Hold back an unfinished sentence that may become a credit statement.
    const held = input.replace(PARTIAL_CREDIT_TAIL, (tail) => (/\d/.test(tail) || /credit/i.test(tail) ? "" : tail));
    if (held !== input) input = held.trimEnd();
  }
  if (!/credit/i.test(input)) return input;

  let changed = input !== text;
  const lines = input.split("\n").flatMap((line) => {
    if (!/credit/i.test(line)) return [line];
    const withoutParens = line.replace(CREDIT_PARENTHETICAL, (match, inner: string) => (isCreditStatement(inner) ? "" : match));
    const sentences = withoutParens.split(/(?<=[.!?])\s+/);
    const kept = sentences.filter((s) => !isCreditStatement(s));
    const next = kept.join(" ");
    if (next === line) return [line];
    changed = true;
    return next.trim().length === 0 ? [] : [next.trimEnd()];
  });
  if (!changed) return input;
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The one display/context sanitizer for assistant prose (media URLs + credit statements). */
export function sanitizeAssistantText(text: string, opts: { streaming?: boolean } = {}): string {
  return stripCreditStatements(stripMediaReferences(text, opts), opts);
}
