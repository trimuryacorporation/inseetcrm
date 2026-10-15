export const contactFields = ["email", "phone"];
export function normalizeEmail(value) {
  if (value == null || String(value).trim() === "") return undefined;
  const result = String(value).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    throw Object.assign(new Error("Enter a valid email address"), {
      status: 400,
    });
  return result;
}
export function normalizePhone(value) {
  if (value == null || String(value).trim() === "") return undefined;
  const input = String(value).trim();
  if (!/^\+?[0-9 ().-]+$/.test(input))
    throw Object.assign(new Error("Enter a valid phone number"), {
      status: 400,
    });
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (!input.startsWith("+")) {
    if (digits.length === 10) digits = "91" + digits;
    else if (digits.length === 11 && digits.startsWith("0"))
      digits = "91" + digits.slice(1);
  }
  if (digits.length < 8 || digits.length > 15)
    throw Object.assign(
      new Error(
        "Phone number must include a valid country code or 10-digit Indian number",
      ),
      { status: 400 },
    );
  return "+" + digits;
}
export const normalizeContact = (field, value) =>
  field === "email" ? normalizeEmail(value) : normalizePhone(value);
export function contactPolicy(schema) {
  for (const field of contactFields) {
    const path = schema.path(field);
    if (!path) continue;
    path.set((value) => normalizeContact(field, value));
    if (!path.options.unique)
      schema.index(
        { [field]: 1 },
        {
          name: "identity_" + field + "_unique",
          unique: true,
          partialFilterExpression: { [field]: { $type: "string", $gt: "" } },
        },
      );
  }
}
