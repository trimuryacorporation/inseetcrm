export function rupeesToPaise(input) {
  const value = String(input ?? "").trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value))
    throw new Error("Enter an INR amount with up to two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const result = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
  if (result > 1000000000000) throw new Error("Amount is too large.");
  return result;
}
export const isPlacementMoney = (key) =>
  ["joiningSalaryPaise", "feePaise"].includes(key);
