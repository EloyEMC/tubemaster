import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMetadataBatchExecutionReport } from "./report";

test("normalizes execution outcomes in input order with stable totals", () => {
  const report = normalizeMetadataBatchExecutionReport(
    ["video-1", "video-2", "video-3", "video-4"],
    {
      confirmationId: "a".repeat(64),
      expectedChannelId: "UC1234567890123456789012",
      outcomes: [
        { videoId: "video-3", status: "provider-failure", error: { code: "update_failed", message: "provider detail" } },
        { videoId: "video-1", status: "success" },
      ],
    }
  );

  assert.deepEqual(report, {
    totals: { requested: 4, attempted: 2, succeeded: 1, failed: 1, skipped: 2 },
    items: [
      { videoId: "video-1", status: "succeeded" },
      { videoId: "video-2", status: "skipped" },
      { videoId: "video-3", status: "failed", error: { code: "update_failed", message: "Metadata update failed" } },
      { videoId: "video-4", status: "skipped" },
    ],
  });
});

test("sanitizes unknown errors and produces byte-equivalent repeated serialization", () => {
  const result = {
    confirmationId: "b".repeat(64),
    expectedChannelId: "UC1234567890123456789012",
    outcomes: [{
      videoId: "video-1",
      status: "provider-failure" as const,
      error: { code: "provider-secret", message: "token=https://private.example/secret" },
    }],
  };

  const first = normalizeMetadataBatchExecutionReport(["video-1"], result);
  const second = normalizeMetadataBatchExecutionReport(["video-1"], structuredClone(result));

  assert.deepEqual(first, {
    totals: { requested: 1, attempted: 1, succeeded: 0, failed: 1, skipped: 0 },
    items: [{ videoId: "video-1", status: "failed", error: { code: "unknown_error", message: "An unknown execution error occurred" } }],
  });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(first).includes("private.example"), false);
});
