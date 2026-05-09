/**
 * Format a phone number consistently for display.
 * Accepts E.164 (+17865551234) or raw 10-digit US numbers and returns
 * "+1 786-555-1234". Anything that doesn't match falls back to the input.
 */
export function formatPhone(input: string | null | undefined): string {
  if (!input) return ''
  const digits = input.replace(/[^0-9]/g, '')
  // US 10-digit
  if (digits.length === 10) {
    return `+1 ${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  // US 11-digit (with country code 1)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  // International — E.164 with + prefix, no formatting
  if (input.startsWith('+')) return input
  return input
}
