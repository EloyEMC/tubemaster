import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryQuotaAccountant,
  YOUTUBE_QUOTA_COSTS,
  getQuotaBucketStart,
  resolveQuotaTimezone,
  type QuotaOperation,
} from "./accountant";

test("in-memory quota accountant records safe entries and accumulates repeated calls", () => {
  const accountant = new InMemoryQuotaAccountant();

  accountant.record({ operationId: "operation-1", operation: "videos.list" });
  accountant.record({ operationId: "operation-1", operation: "videos.update" });
  accountant.record({ operationId: "operation-2", operation: "videos.list" });

  const entries = accountant.entries();
  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map(({ operationId, operation, estimatedUnits }) => ({
      operationId,
      operation,
      estimatedUnits,
    })),
    [
      { operationId: "operation-1", operation: "videos.list", estimatedUnits: 1 },
      { operationId: "operation-1", operation: "videos.update", estimatedUnits: 50 },
      { operationId: "operation-2", operation: "videos.list", estimatedUnits: 1 },
    ],
  );
  for (const entry of entries) {
    assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(Object.keys(entry).sort(), [
      "estimatedUnits",
      "operation",
      "operationId",
      "timestamp",
    ]);
  }
  (entries[0] as { operationId: string }).operationId = "changed";
  assert.equal(accountant.entries()[0].operationId, "operation-1");
});

test("explicit YouTube costs cover every supported operation", () => {
  const expected: Record<QuotaOperation, number> = {
    "channels.list": 1,
    "videos.list": 1,
    "videos.update": 50,
    "playlists.list": 1,
    "playlists.insert": 50,
    "playlists.update": 50,
    "playlists.delete": 50,
    "playlistItems.list": 1,
    "playlistItems.insert": 50,
    "playlistItems.delete": 50,
    "captions.list": 50,
    "captions.download": 200,
  };
  assert.deepEqual(YOUTUBE_QUOTA_COSTS, expected);
});

test("quota bucket timezone defaults safely and is deterministic", () => {
  assert.equal(resolveQuotaTimezone(), "America/Los_Angeles");
  assert.equal(resolveQuotaTimezone("not-a-timezone"), "UTC");
  assert.equal(resolveQuotaTimezone("UTC"), "UTC");
  assert.equal(
    getQuotaBucketStart(new Date("2026-01-02T07:30:00.000Z"), "America/Los_Angeles"),
    "2026-01-01",
  );
  assert.equal(
    getQuotaBucketStart(new Date("2026-01-02T08:30:00.000Z"), "America/Los_Angeles"),
    "2026-01-02",
  );
  assert.equal(getQuotaBucketStart(new Date("2026-01-02T07:30:00.000Z"), "UTC"), "2026-01-02");
});
