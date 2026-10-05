import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuotaFilters, quotaUsage } from "./quota";

test("MCP normalizes all, null and explicit channel selectors", () => {
  for (const input of [{}, { channelId: "all" }]) assert.deepEqual(parseQuotaFilters(input), {});
  for (const input of [{ channelId: "null" }, { channelId: null }]) assert.deepEqual(parseQuotaFilters(input), { channelId: null });
  assert.deepEqual(parseQuotaFilters({ channelId: "UC_abc-2" }), { channelId: "UC_abc-2" });
});

test("MCP forwards active-user channel filters and preserves text/structured envelopes", async () => {
  for (const [input, expected] of [[{}, {}], [{ channelId: "all" }, {}], [{ channelId: null }, { channelId: null }], [{ channelId: "channel-a", operationId: "op:1" }, { channelId: "channel-a", operationId: "op:1" }]] as const) {
    const result = await quotaUsage(input, {
      whoami: async () => ({ activeUser: { userId: "owner" } }),
      summarize: async (scope, filters) => {
        assert.deepEqual(scope, { kind: "user", userId: "owner" });
        assert.deepEqual(filters, expected);
        return [{ bucketStart: "2025-01-01", operation: "videos.list", channelId: null, operationCount: 1, estimatedUnits: 1 }];
      },
    });
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    assert.equal(result.isError, undefined);
    assert.match((result.structuredContent as { data: { estimateNotice: string } }).data.estimateNotice, /not a Google quota balance/);
  }
});

test("MCP rejects unsafe filters before authentication or querying", async () => {
  for (const input of [{ scope: "global" }, { userId: "other" }, { bucketStart: "2025-02-29" }, { operation: "unknown" }, { operationId: "../bad" }, { channelId: "bad/id" }, { channelId: "" }, { channelId: 4 }]) {
    const result = await quotaUsage(input, {
      whoami: async () => { throw new Error("unexpected authentication"); },
      summarize: async () => { throw new Error("unexpected query"); },
    });
    assert.equal(result.isError, true);
    assert.equal((result.structuredContent as { error: { code: string } }).error.code, "validation_failed");
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  }
});

test("MCP denies missing identity and preserves repository error envelopes", async () => {
  for (const deps of [
    { whoami: async () => ({}), summarize: async () => { throw new Error("unexpected query"); } },
    { whoami: async () => ({ userId: "owner" }), summarize: async () => { throw new Error("storage unavailable"); } },
  ]) {
    const result = await quotaUsage({}, deps);
    assert.equal(result.isError, true);
    assert.equal((result.structuredContent as { error: { code: string } }).error.code, "internal_error");
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  }
});
