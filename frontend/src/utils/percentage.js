export function percentToBasisPoints(input) {
  const value = String(input).trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value))
    throw new Error(
      "Enter a commission between 0 and 100%, with up to two decimal places.",
    );
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (result > 10000) throw new Error("Commission cannot exceed 100%.");
  return result;
}
