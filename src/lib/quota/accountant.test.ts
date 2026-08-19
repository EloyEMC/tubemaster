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
import {
  listQuotaUsage,
  quotaUsageRepository,
  summarizeQuotaUsage,
} from "../quota/repository";

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
