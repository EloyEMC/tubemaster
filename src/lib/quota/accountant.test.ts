import assert from "node:assert/strict";
import test from "node:test";
import {
  DurableQuotaAccountant,
  InMemoryQuotaAccountant,
  createDurableQuotaAccountantFactory,
  YOUTUBE_QUOTA_COSTS,
  getQuotaBucketStart,
  resolveQuotaTimezone,
  type QuotaOperation,
} from "./accountant";
import { db } from "../db";
import {
  listQuotaUsage,
  quotaUsageRepository,
  summarizeQuotaUsage,
} from "../quota/repository";
import { sql } from "drizzle-orm";

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
      {
        operationId: "operation-1",
        operation: "videos.list",
        estimatedUnits: 1,
      },
      {
        operationId: "operation-1",
        operation: "videos.update",
        estimatedUnits: 50,
      },
      {
        operationId: "operation-2",
        operation: "videos.list",
        estimatedUnits: 1,
      },
    ],
  );
  for (const entry of entries) {
    assert.equal(typeof entry.timestamp, "string");
    assert.deepEqual(Object.keys(entry).sort(), [
      "estimatedUnits",
      "operation",
      "operationId",
      "timestamp",
    ]);
  }
});

test("default accountant factory derives durable user and global scopes from resolved credentials", async () => {
  const inserted: Array<{ scopeType: string; scopeId: string | null }> = [];
  const factory = createDurableQuotaAccountantFactory({
    repository: {
      insert: async (entry: { scopeType: string; scopeId: string | null }) => {
        inserted.push({ scopeType: entry.scopeType, scopeId: entry.scopeId });
      },
    },
  });

  const userAccountant = factory({ credentialRef: { userId: "user-a" } });
  const globalAccountant = factory({
    credentialRef: { accessToken: "secret-token" },
  });

  userAccountant.record({
    operationId: "factory-user",
    operation: "videos.list",
  });
  globalAccountant.record({
    operationId: "factory-global",
    operation: "videos.list",
  });
  await Promise.all([userAccountant.flush(), globalAccountant.flush()]);

  assert.deepEqual(inserted, [
    { scopeType: "user", scopeId: "user-a" },
    { scopeType: "global", scopeId: null },
  ]);
});

test("durable record eventually persists without an explicit flush", async () => {
  const inserted: string[] = [];
  const accountant = new DurableQuotaAccountant({
    repository: {
      insert: async ({ operationId }) => {
        inserted.push(operationId);
      },
    },
  });

  accountant.record({ operationId: "automatic", operation: "videos.list" });

  await Promise.resolve();
  assert.deepEqual(inserted, ["automatic"]);
});

test("durable quota accountant persists repeated records and survives re-instantiation", async () => {
  const operationId = `durable-${Date.now()}-${Math.random()}`;
  const first = new DurableQuotaAccountant({
    userId: "user-a",
    now: () => new Date("2026-01-02T08:00:00.000Z"),
  });

  first.record({ operationId, operation: "videos.update" });
  await first.flush();

  const second = new DurableQuotaAccountant({
    userId: "user-a",
    now: () => new Date("2026-01-02T08:00:00.000Z"),
  });
  second.record({ operationId, operation: "videos.list" });
  await second.flush();

  const rows = await listQuotaUsage({ operationId });
  assert.deepEqual(
    rows.map((row) => row.estimatedUnits).sort((a, b) => b - a),
    [50, 1],
  );
  assert.deepEqual(
    rows.map((row) => ({ scopeType: row.scopeType, scopeId: row.scopeId })),
    [
      { scopeType: "user", scopeId: "user-a" },
      { scopeType: "user", scopeId: "user-a" },
    ],
  );
});

test("durable quota accountant isolates users and falls back to global scope", async () => {
  const operationId = `scope-${Date.now()}-${Math.random()}`;
  const user = new DurableQuotaAccountant({ userId: "user-a" });
  const other = new DurableQuotaAccountant({ userId: "user-b" });
  const global = new DurableQuotaAccountant();

  user.record({ operationId, operation: "videos.list" });
  other.record({ operationId, operation: "videos.list" });
  global.record({ operationId, operation: "videos.list" });
  await Promise.all([user.flush(), other.flush(), global.flush()]);

  const rows = await listQuotaUsage({ operationId });
  assert.deepEqual(
    rows
      .map((row) => [row.scopeType, row.scopeId])
      .sort((a, b) => String(a[1]).localeCompare(String(b[1]))),
    [
      ["global", null],
      ["user", "user-a"],
      ["user", "user-b"],
    ],
  );
});

test("quota bucket timezone defaults safely and is deterministic", () => {
  assert.equal(resolveQuotaTimezone(), "America/Los_Angeles");
  assert.equal(resolveQuotaTimezone("not-a-timezone"), "UTC");
  assert.equal(resolveQuotaTimezone("UTC"), "UTC");
  assert.equal(
    getQuotaBucketStart(
      new Date("2026-01-02T07:30:00.000Z"),
      "America/Los_Angeles",
    ),
    "2026-01-01",
  );
  assert.equal(
    getQuotaBucketStart(
      new Date("2026-01-02T08:30:00.000Z"),
      "America/Los_Angeles",
    ),
    "2026-01-02",
  );
});

test("durable flush persistence failures do not escape record or service accounting", async () => {
  const errors: unknown[] = [];
  const accountant = new DurableQuotaAccountant({
    repository: {
      insert: async () => {
        throw new Error("persistence unavailable");
      },
    },
    onPersistenceError: (error) => errors.push(error),
  });

  assert.doesNotThrow(() =>
    accountant.record({ operationId: "failed", operation: "videos.list" }),
  );
  await accountant.flush();
  assert.equal(errors.length, 1);
  assert.equal(accountant.entries().length, 1);
});

test("quota usage summaries aggregate by bucket, scope, and operation", async () => {
  const prefix = `summary-${Date.now()}-${Math.random()}`;
  await Promise.all([
    quotaUsageRepository.insert({
      id: `${prefix}-user-list-1`,
      scopeType: "user",
      scopeId: prefix,
      bucketStart: "2099-01-01",
      operation: "videos.list",
      estimatedUnits: 1,
      operationId: `${prefix}-operation-1`,
      recordedAt: "2099-01-01T00:00:00.000Z",
    }),
    quotaUsageRepository.insert({
      id: `${prefix}-user-list-2`,
      scopeType: "user",
      scopeId: prefix,
      bucketStart: "2099-01-01",
      operation: "videos.list",
      estimatedUnits: 2,
      operationId: `${prefix}-operation-2`,
      recordedAt: "2099-01-01T00:01:00.000Z",
    }),
    quotaUsageRepository.insert({
      id: `${prefix}-global-update`,
      scopeType: "global",
      scopeId: null,
      bucketStart: "2099-01-01",
      operation: "videos.update",
      estimatedUnits: 50,
      operationId: `${prefix}-operation-3`,
      recordedAt: "2099-01-01T00:02:00.000Z",
    }),
  ]);

  assert.deepEqual(
    await summarizeQuotaUsage({ operationId: `${prefix}-operation-1` }),
    [
      {
        bucketStart: "2099-01-01",
        scopeType: "user",
        scopeId: prefix,
        operation: "videos.list",
        operationId: `${prefix}-operation-1`,
        operationCount: 1,
        estimatedUnits: 1,
      },
    ],
  );
  assert.deepEqual(
    await summarizeQuotaUsage({ operationId: `${prefix}-operation-3` }),
    [
      {
        bucketStart: "2099-01-01",
        scopeType: "global",
        scopeId: null,
        operation: "videos.update",
        operationId: `${prefix}-operation-3`,
        operationCount: 1,
        estimatedUnits: 50,
      },
    ],
  );
  assert.deepEqual(
    await summarizeQuotaUsage({
      scopeType: "user",
      scopeId: prefix,
      operation: "videos.list",
    }),
    [
      {
        bucketStart: "2099-01-01",
        scopeType: "user",
        scopeId: prefix,
        operation: "videos.list",
        operationId: `${prefix}-operation-1`,
        operationCount: 1,
        estimatedUnits: 1,
      },
      {
        bucketStart: "2099-01-01",
        scopeType: "user",
        scopeId: prefix,
        operation: "videos.list",
        operationId: `${prefix}-operation-2`,
        operationCount: 1,
        estimatedUnits: 2,
      },
    ],
  );
});

test("quota usage schema has migration-safe reporting indexes", async () => {
  const indexes = await db.all<{ name: string }>(sql`
    SELECT name
    FROM sqlite_master
    WHERE type = 'index'
      AND tbl_name = 'youtube_quota_usage'
      AND name NOT LIKE 'sqlite_autoindex_%'
  `);

  assert.deepEqual(
    indexes.map((index) => index.name).sort(),
    ["youtube_quota_usage_operation_id_idx", "youtube_quota_usage_scope_date_operation_idx"].sort(),
  );
});

test("quota usage summaries return empty results without exposing ledger fields", async () => {
  const rows = await summarizeQuotaUsage({
    operationId: `missing-${Date.now()}-${Math.random()}`,
  });
  assert.deepEqual(rows, []);
  assert.deepEqual(Object.keys(rows), []);
});

test("quota cost table is explicit for playlist and transcript operations", () => {
  const operations: QuotaOperation[] = [
    "channels.list",
    "videos.list",
    "videos.update",
    "playlists.list",
    "playlists.insert",
    "playlists.update",
    "playlists.delete",
    "playlistItems.list",
    "playlistItems.insert",
    "playlistItems.delete",
    "captions.list",
    "captions.download",
  ];
  assert.deepEqual(
    operations.map((operation) => YOUTUBE_QUOTA_COSTS[operation]),
    [1, 1, 50, 1, 50, 50, 50, 1, 50, 50, 50, 200],
  );
});

test('"reports.query" quota cost exists and is a valid QuotaOperation', () => {
  const operation = "reports.query" as keyof typeof YOUTUBE_QUOTA_COSTS;
  assert.equal(YOUTUBE_QUOTA_COSTS[operation], 1);
  assert.equal(Object.hasOwn(YOUTUBE_QUOTA_COSTS, operation), true);
});

test("runtime validation rejects unknown operations before recording or persisting", async () => {
  const inserts: unknown[] = [];
  const accountant = new DurableQuotaAccountant({
    repository: {
      insert: async (entry) => {
        inserts.push(entry);
      },
    },
  });

  assert.throws(() =>
    accountant.record({
      operationId: "invalid-operation",
      operation: "unknown.operation" as QuotaOperation,
    }),
  );
  await accountant.flush();

  assert.deepEqual(accountant.entries(), []);
  assert.deepEqual(inserts, []);
});

test("runtime validation rejects empty operation identities", () => {
  const accountant = new InMemoryQuotaAccountant();

  assert.throws(() =>
    accountant.record({ operationId: "   ", operation: "videos.list" }),
  );
  assert.deepEqual(accountant.entries(), []);
});

test("concurrent flushes drain each queued record exactly once", async () => {
  const inserts: string[] = [];
  const accountant = new DurableQuotaAccountant({
    repository: {
      insert: async ({ operationId }) => {
        inserts.push(operationId);
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
    },
  });
  accountant.record({ operationId: "concurrent", operation: "videos.list" });

  await Promise.all([accountant.flush(), accountant.flush()]);

  assert.deepEqual(inserts, ["concurrent"]);
});

test("records added during a flush trigger a subsequent drain", async () => {
  let releaseFirst!: () => void;
  const firstPersistence = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const inserts: string[] = [];
  const accountant = new DurableQuotaAccountant({
    repository: {
      insert: async ({ operationId }) => {
        inserts.push(operationId);
        if (operationId === "first") await firstPersistence;
      },
    },
  });

  accountant.record({ operationId: "first", operation: "videos.list" });
  const firstFlush = accountant.flush();
  await Promise.resolve();
  accountant.record({ operationId: "during", operation: "videos.list" });
  releaseFirst();
  await firstFlush;

  assert.deepEqual(inserts, ["first", "during"]);
});
