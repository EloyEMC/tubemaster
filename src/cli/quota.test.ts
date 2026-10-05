import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuotaArgs, runQuotaCli } from "./quota";

test("CLI channel selectors normalize all, null, and explicit IDs", () => {
  assert.deepEqual(parseQuotaArgs(["usage"]), {});
  assert.deepEqual(parseQuotaArgs(["usage", "--channelId", "all"]), {});
  assert.deepEqual(parseQuotaArgs(["usage", "--channelId", "null"]), { channelId: null });
  assert.deepEqual(parseQuotaArgs(["usage", "--channelId", "UC_abc-2"]), { channelId: "UC_abc-2" });
});

test("CLI rejects invalid and duplicate selectors", () => {
  for (const argv of [["usage", "--scope", "global"], ["usage", "--channelId", "bad/id"], ["usage", "--channelId", ""], ["usage", "--channelId"], ["usage", "--channelId", "a", "--channelId", "b"]]) {
    assert.throws(() => parseQuotaArgs(argv));
  }
});

test("CLI forwards active user filters and preserves estimate envelope", async () => {
  const lines: string[] = [];
  const code = await runQuotaCli({ argv: ["usage", "--operation", "videos.list", "--channelId", "channel-a"], writeStdout: (line) => lines.push(line), deps: {
    whoami: async () => ({ activeUser: { userId: "active" } }),
    summarize: async (scope, filters) => {
      assert.deepEqual(scope, { kind: "user", userId: "active" });
      assert.deepEqual(filters, { operation: "videos.list", channelId: "channel-a" });
      return [{ bucketStart: "2025-01-01", operation: "videos.list", channelId: "channel-a", operationCount: 1, estimatedUnits: 1 }];
    },
  } });
  assert.equal(code, 0);
  const payload = JSON.parse(lines[0]);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.summaries[0].channelId, "channel-a");
  assert.match(payload.data.estimateNotice, /non-authoritative/);
});

test("CLI auth and validation failures exit one with stable error envelopes", async () => {
  for (const argv of [["usage"], ["usage", "--channelId", "bad/id"]]) {
    const lines: string[] = [];
    const code = await runQuotaCli({ argv, writeStdout: (line) => lines.push(line), deps: {
      whoami: async () => { throw new Error("no auth"); }, summarize: async () => { throw new Error("unexpected query"); },
    } });
    assert.equal(code, 1);
    assert.equal(JSON.parse(lines[0]).error.code, argv.length === 1 ? "internal_error" : "validation_failed");
  }
});
