import assert from "node:assert/strict";
import test from "node:test";
import { formatQuotaBucketStart } from "./formatter";

test("formats a UTC midnight bucket using its UTC calendar day", () => {
  assert.equal(formatQuotaBucketStart("2025-01-15T00:00:00.000Z"), "Jan 15, 2025");
});

test("formats a valid non-midnight timestamp using its UTC calendar day", () => {
  assert.equal(formatQuotaBucketStart("2025-01-15T23:30:00.000Z"), "Jan 15, 2025");
});

test("preserves invalid bucket timestamps", () => {
  assert.equal(formatQuotaBucketStart("not-a-date"), "not-a-date");
});
