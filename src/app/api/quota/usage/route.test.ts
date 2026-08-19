import assert from "node:assert/strict";
import test from "node:test";
import { createQuotaUsageGetHandler } from "./route";
import type { QuotaUsageSummary } from "@/lib/quota/repository";

const summaries: QuotaUsageSummary[] = [
  {
    bucketStart: "2025-01-01T00:00:00.000Z",
    scopeType: "user",
    scopeId: "user-1",
    operation: "video_metadata",
    operationCount: 2,
    estimatedUnits: 20,
  },
];

test("quota usage route returns unauthorized without a session", async () => {
  let repositoryCalls = 0;
  const handler = createQuotaUsageGetHandler({
    getSession: async () => null,
    repository: {
      summarizeQuotaUsage: async () => {
        repositoryCalls += 1;
        return summaries;
      },
    },
  });

  const response = await handler();

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.equal(repositoryCalls, 0);
});

test("quota usage route scopes repository lookup to the current user", async () => {
  const filters: unknown[] = [];
  const handler = createQuotaUsageGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    repository: {
      summarizeQuotaUsage: async (filter) => {
        filters.push(filter);
        return summaries;
      },
    },
  });

  const response = await handler();

  assert.equal(response.status, 200);
  assert.deepEqual(filters, [{ scopeType: "user", scopeId: "user-1" }]);
});

test("quota usage route returns summaries on success", async () => {
  const handler = createQuotaUsageGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    repository: { summarizeQuotaUsage: async () => summaries },
  });

  const response = await handler();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { summaries });
});

test("quota usage route returns 500 when the repository fails", async () => {
  const handler = createQuotaUsageGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    repository: {
      summarizeQuotaUsage: async () => {
        throw new Error("database unavailable");
      },
    },
  });

  const response = await handler();

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "Unable to load quota usage",
  });
});
