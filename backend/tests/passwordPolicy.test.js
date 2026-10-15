import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordError } from "../../shared/passwordPolicy.mjs";
import { passwordSchema } from "../src/validators/password.js";
test("shared password policy accepts either case and preserves exact typed values", () => {
  for (const value of [
    "lowercase",
    "UPPERCASE",
    "12345678",
    "p@ssword",
    " Abc123 ",
  ]) {
    assert.equal(passwordError(value), "");
    assert.equal(passwordSchema.parse(value), value);
  }
  for (const value of [
    "short12",
    "        ",
    "a".repeat(73),
    "\u00e9".repeat(37),
  ]) {
    assert.ok(passwordError(value));
    assert.equal(passwordSchema.safeParse(value).success, false);
  }
  assert.equal(passwordError("\u00e9".repeat(36)), "");
  assert.doesNotThrow(
    () => new RegExp("[a-zA-Z0-9][a-zA-Z0-9._\\x2d]{2,49}", "v"),
  );
});
