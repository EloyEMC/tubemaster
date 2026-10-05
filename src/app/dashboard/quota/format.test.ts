import assert from "node:assert/strict";
import test from "node:test";
import { formatBucket, isQuotaSummary } from "./format";

test("formats a valid UTC calendar bucket without timezone conversion", () => {
  assert.equal(formatBucket("2026-01-01"), "2026-01-01");
  assert.equal(formatBucket("2024-02-29"), "2024-02-29");
});

test("rejects malformed and impossible buckets safely", () => {
  for (const bucket of ["2026-02-30", "2025-02-29", "2026-13-01", "not-a-date", "2026-01-01T00:00:00Z"]) {
    assert.equal(formatBucket(bucket), "Unknown date");
  }
});

test("accepts only finite nonnegative numeric usage rows", () => {
  const row = { bucketStart: "2026-01-01", operation: "search", operationCount: 0, estimatedUnits: 100 };
  assert.equal(isQuotaSummary(row), true);
  assert.equal(isQuotaSummary({ ...row, estimatedUnits: Infinity }), false);
  assert.equal(isQuotaSummary({ ...row, operationCount: -1 }), false);
  assert.equal(isQuotaSummary(null), false);
});
