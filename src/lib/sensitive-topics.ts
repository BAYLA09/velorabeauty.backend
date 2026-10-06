/** Patterns that require human review before automated support actions. */
const SENSITIVE_PATTERNS: RegExp[] = [
  /\brefund\b/i,
  /\bchargeback\b/i,
  /\bdispute\b/i,
  /\blegal\b/i,
  /\blawyer\b/i,
  /\battorney\b/i,
  /\bsue\b/i,
  /\baccount ownership\b/i,
  /\bhacked\b/i,
  /\bunauthorized\b/i,
  /\bfraud\b/i,
  /\bcomplaint\b/i,
  /\bbb[bc]\b/i,
  /\bftc\b/i,
];

export function requiresHumanReview(text: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}
