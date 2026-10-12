import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeExecutionReport } from "./execution-report";

test("normalizes ordered outcomes and counts every attempted video", () => {
  const result = normalizeExecutionReport({
    confirmationId: "a".repeat(64),
    expectedChannelId: "channel",
    outcomes: [
      { videoId: "first", status: "success" },
      { videoId: "second", status: "provider-failure", error: { code: "update_failed", message: "secret https://example.com" } },
      { videoId: "third", status: "success" },
    ],
  });
  assert.deepEqual(result.totals, { requested: 3, attempted: 3, succeeded: 2, failed: 1, skipped: 0 });
  assert.deepEqual(result.items, [
    { videoId: "first", status: "succeeded" },
    { videoId: "second", status: "failed", error: { code: "update_failed", message: "Metadata update failed" } },
    { videoId: "third", status: "succeeded" },
  ]);
});

test("unknown codes and arbitrary provider fields cannot leak into the report", () => {
  const result = normalizeExecutionReport({
    confirmationId: "b".repeat(64),
    expectedChannelId: "channel",
    outcomes: [{
      videoId: "video", status: "provider-failure",
      error: { code: "token=https://example.com", message: "Bearer secret\nstack trace", details: "response body" },
      headers: { authorization: "Bearer secret" },
      prompt: "private prompt",
    } as never],
  });
  assert.deepEqual(result.items, [
    { videoId: "video", status: "failed", error: { code: "unknown_error", message: "Metadata update failed" } },
  ]);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(JSON.stringify(result).includes("private prompt"), false);
  assert.deepEqual(result.totals, { requested: 1, attempted: 1, succeeded: 0, failed: 1, skipped: 0 });
});
