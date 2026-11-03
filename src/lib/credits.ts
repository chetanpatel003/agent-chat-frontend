/**
 * Display formatting for raw integer credits (Magica's unit; see the
 * credits contract). Exact with thousands separators below one million
 * ("5,000", "273,936"); millions with an "M" suffix above ("1.25M").
 * Display only — stored and settled values are never scaled.
 */
export function formatCredits(credits: number): string {
  if (Math.abs(credits) < 1_000_000) return credits.toLocaleString("en-US");
  return `${(credits / 1_000_000).toFixed(2)}M`;
}

/** Exact value for tooltips and screen readers ("273,936 credits"). */
export function exactCredits(credits: number): string {
  return `${credits.toLocaleString("en-US")} credits`;
}
