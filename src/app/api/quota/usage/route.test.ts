import assert from "node:assert/strict";
import test from "node:test";
import { createQuotaUsageGetHandler } from "./route";
import type { QuotaUsageSummary } from "@/lib/quota/repository";

const summaries: QuotaUsageSummary[] = [
  {
    bucketStart: "2025-01-01T00:00:00.000Z",
    scopeType: "user",
    scopeId: "user-1",
    operation: "reports.query",
    operationId: "operation-1",
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

test("quota usage route forwards safe filters while preserving user scope", async () => {
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

  const response = await handler(
    new Request(
      "http://localhost/api/quota/usage?bucketStart=2025-01-01&operation=reports.query&operationId=operation-1",
    ),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(filters, [
    {
      scopeType: "user",
      scopeId: "user-1",
      bucketStart: "2025-01-01",
      operation: "reports.query",
      operationId: "operation-1",
    },
  ]);
});

    test("quota usage route forwards channel filtering without changing user scope", async () => {
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

      const response = await handler(
        new Request("http://localhost/api/quota/usage?channelId=channel-a"),
      );

      assert.equal(response.status, 200);
      assert.deepEqual(filters, [
        { scopeType: "user", scopeId: "user-1", channelId: "channel-a" },
      ]);
    });

    test("quota usage route rejects empty or invalid channel filters", async () => {
      for (const channelId of ["", "   ", "channel/a"]) {
        let repositoryCalls = 0;
        const handler = createQuotaUsageGetHandler({
          getSession: async () => ({ user: { id: "user-1" } }),
          repository: {
            summarizeQuotaUsage: async () => {
              repositoryCalls += 1;
              return summaries;
            },
          },
        });

        const response = await handler(
          new Request(
            `http://localhost/api/quota/usage?channelId=${encodeURIComponent(channelId)}`,
          ),
        );

        assert.equal(response.status, 422);
        assert.equal(repositoryCalls, 0);
      }
    });

    test("quota usage route rejects an invalid bucket date without a repository call", async () => {
  let repositoryCalls = 0;
  const handler = createQuotaUsageGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    repository: {
      summarizeQuotaUsage: async () => {
        repositoryCalls += 1;
        return summaries;
      },
    },
  });

  const response = await handler(
    new Request("http://localhost/api/quota/usage?bucketStart=2025-02-30"),
  );

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    error: "Invalid quota usage query",
    code: "INVALID_INPUT",
  });
  assert.equal(repositoryCalls, 0);
});

test("quota usage route rejects an unknown operation without a repository call", async () => {
  let repositoryCalls = 0;
  const handler = createQuotaUsageGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    repository: {
      summarizeQuotaUsage: async () => {
        repositoryCalls += 1;
        return summaries;
      },
    },
  });

  const response = await handler(
    new Request("http://localhost/api/quota/usage?operation=unknown.operation"),
  );

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    error: "Invalid quota usage query",
    code: "INVALID_INPUT",
  });
  assert.equal(repositoryCalls, 0);
});

test("quota usage route rejects caller-controlled scope filters", async () => {
  let repositoryCalls = 0;
  const handler = createQuotaUsageGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    repository: {
      summarizeQuotaUsage: async () => {
        repositoryCalls += 1;
        return summaries;
      },
    },
  });

  const response = await handler(
    new Request(
      "http://localhost/api/quota/usage?scopeType=global&scopeId=other-user&channelId=channel-a",
    ),
  );

  assert.equal(response.status, 422);
  assert.equal(repositoryCalls, 0);
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

test("quota usage route returns 422 for a malformed request URL", async () => {
  const handler = createQuotaUsageGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    repository: {
      summarizeQuotaUsage: async () => summaries,
    },
  });

  const response = await handler({ url: "not-a-url" } as Request);

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    error: "Invalid quota usage query",
    code: "INVALID_INPUT",
  });
});
