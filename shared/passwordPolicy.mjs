export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;
export function passwordError(value) {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH)
    return "Use at least 8 characters.";
  if (!value.trim()) return "Password cannot contain only spaces.";
  if (new TextEncoder().encode(value).length > MAX_PASSWORD_BYTES)
    return "Password must be no more than 72 UTF-8 bytes.";
  return "";
}
