import assert from "node:assert/strict";
import test from "node:test";
import { isValidNewTalgoPhone } from "../app/lib/newTalgoPhone.ts";

test("New Talgo accepts Spanish and international contact numbers", () => {
  for (const value of ["600 000 000", "921 123 456", "+34 600 000 000", "0034 921 123 456", "+44 20 7946 0958"]) {
    assert.equal(isValidNewTalgoPhone(value), true, value);
  }
});

test("New Talgo rejects empty, malformed and short numbers", () => {
  for (const value of ["", "123456789", "60000", "+34 123 456 789", "600 abc 000", "++34600000000", "+44 12"]) {
    assert.equal(isValidNewTalgoPhone(value), false, value);
  }
});
