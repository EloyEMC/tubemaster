import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { SQLiteQuotaRepository } from "./repository";
import test from "node:test";
import {
  InMemoryQuotaAccountant,
  createDurableQuotaAccountant,
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

test("durable entries aggregate by bucket and isolate user/global scopes", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    const repository = new SQLiteQuotaRepository(client);
    await repository.initialize();
    const now = () => new Date("2026-01-02T07:30:00.000Z");
    const user = createDurableQuotaAccountant({ client, scope: { kind: "user", userId: "a" }, now });
    const other = createDurableQuotaAccountant({ client, scope: { kind: "user", userId: "b" }, now });
    const global = createDurableQuotaAccountant({ client, scope: { kind: "global" }, now });
    user.record({ operationId: "same", operation: "videos.list" });
    user.record({ operationId: "same", operation: "videos.update" });
    other.record({ operationId: "same", operation: "videos.list" });
    global.record({ operationId: "same", operation: "captions.download" });
    // Await the client's query after inserts have been scheduled on the same connection.
    assert.equal(await repository.total({ kind: "user", userId: "a" }, "2026-01-01"), 51);
    assert.equal(await repository.total({ kind: "user", userId: "b" }, "2026-01-01"), 1);
    assert.equal(await repository.total({ kind: "global" }, "2026-01-01"), 200);
    assert.equal(await repository.total({ kind: "user", userId: "a" }, "2026-01-02"), 0);
    assert.equal((await client.execute("SELECT COUNT(*) AS count FROM quota_entries")).rows[0].count, 4);
  } finally {
    client.close();
  }
});

test("channel totals isolate identities while omitted filter includes legacy rows", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    const repository = new SQLiteQuotaRepository(client);
    await repository.initialize();
    const scope = { kind: "user" as const, userId: "a" };
    const now = () => new Date("2026-01-02T07:30:00.000Z");
    for (const channelId of ["one", "two", undefined]) {
      createDurableQuotaAccountant({ client, scope, channelId, now }).record({
        operationId: "same", operation: "videos.list",
      });
    }
    assert.equal(await repository.total(scope, "2026-01-01"), 3);
    assert.equal(await repository.total(scope, "2026-01-01", "one"), 1);
    assert.equal(await repository.total(scope, "2026-01-01", "two"), 1);
    assert.equal(await repository.total(scope, "2026-01-01", null), 1);
    assert.equal(await repository.total(scope, "2026-01-01", "missing"), 0);
    assert.equal(await repository.total({ kind: "global" }, "2026-01-01"), 0);
  } finally {
    client.close();
  }
});

test("repository initializes old quota tables without losing legacy entries", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    await client.execute(`CREATE TABLE quota_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, scope_kind TEXT NOT NULL, user_id TEXT,
      operation_id TEXT NOT NULL, operation TEXT NOT NULL, estimated_units INTEGER NOT NULL,
      timestamp TEXT NOT NULL, bucket_start TEXT NOT NULL)`);
    await client.execute(`INSERT INTO quota_entries
      (scope_kind, user_id, operation_id, operation, estimated_units, timestamp, bucket_start)
      VALUES ('user', 'a', 'old', 'videos.list', 7, '2026-01-02T00:00:00Z', '2026-01-01')`);
    const repository = new SQLiteQuotaRepository(client);
    await repository.initialize();
    await repository.initialize();
    assert.equal(await repository.total({ kind: "user", userId: "a" }, "2026-01-01"), 7);
    assert.equal(await repository.total({ kind: "user", userId: "a" }, "2026-01-01", null), 7);
    assert.equal(await repository.total({ kind: "user", userId: "a" }, "2026-01-01", "one"), 0);
    assert.equal((await client.execute("SELECT channel_id FROM quota_entries")).rows[0].channel_id, null);
    const indexes = await client.execute("PRAGMA index_list(quota_entries)");
    assert.ok(indexes.rows.some((row) => row.name === "quota_entries_scope_bucket_channel_idx"));
  } finally {
    client.close();
  }
});

test("durable record isolates synchronous and rejected persistence failures", async () => {
  const entry = { operationId: "op", operation: "videos.list" as const };
  const sync = createDurableQuotaAccountant({
    client: { execute: () => { throw new Error("offline"); } } as never,
    scope: { kind: "global" },
  });
  assert.doesNotThrow(() => sync.record(entry));
  const rejected = createDurableQuotaAccountant({
    client: { execute: () => Promise.reject(new Error("offline")) } as never,
    scope: { kind: "global" },
  });
  assert.doesNotThrow(() => rejected.record(entry));
  await new Promise((resolve) => setImmediate(resolve));
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
