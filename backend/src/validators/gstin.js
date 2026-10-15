const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function gstinCheckDigit(prefix) {
  let factor = 2,
    sum = 0;
  for (let i = prefix.length - 1; i >= 0; i--) {
    const value = alphabet.indexOf(prefix[i]);
    if (value < 0) throw new Error("Invalid GSTIN character");
    const product = value * factor;
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 2 ? 1 : 2;
  }
  return alphabet[(36 - (sum % 36)) % 36];
}
export function validateGstin(input) {
  const gstin = String(input || "")
    .trim()
    .toUpperCase();
  const format =
    /^(0[1-9]|[12][0-9]|3[0-8]|97|99)[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
      gstin,
    );
  const checksum = format && gstinCheckDigit(gstin.slice(0, 14)) === gstin[14];
  return {
    gstin,
    valid: format && checksum,
    checks: { format, checksum },
    registrationVerified: false,
    verification: "format-checksum-only",
    portalUrl: "https://services.gst.gov.in/services/searchtp",
    message: !format
      ? "Enter a valid 15-character GSTIN with state code and PAN structure."
      : !checksum
        ? "GSTIN checksum is invalid. Check the number and try again."
        : "GSTIN format and checksum are valid. Registration status has not been verified with GST authorities.",
  };
}

export function normalizeGstin(value) {
  const result = validateGstin(value);
  if (result.gstin && !result.valid) {
    const error = new Error(result.message);
    error.status = 400;
    throw error;
  }
  return result.gstin;
}
