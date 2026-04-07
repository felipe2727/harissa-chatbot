/**
 * Sanitize user input to reduce prompt injection risk.
 * Strips control characters and collapses excessive whitespace.
 */
export function sanitizeUserMessage(input: string): string {
  // Strip null bytes and control characters (keep newline \n and tab \t)
  let cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  // Collapse excessive newlines and spaces (anti-padding attacks)
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n')
  cleaned = cleaned.replace(/ {10,}/g, '         ')

  return cleaned
}
