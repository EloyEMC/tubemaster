import assert from "node:assert/strict";
import test from "node:test";
import { emitAuditEvent, createDefaultLogger } from "./logger";

test("audit events strictly allowlist vocabulary and scalar context", () => {
  const calls: unknown[] = [];
  const logger = { info: (value: unknown) => calls.push(value), error: (value: unknown) => calls.push(value) };
  emitAuditEvent(logger, "video_metadata.apply.start", {
    operationId: "op-1", channelId: "UC_1", dryRun: true,
    credentialRef: { accessToken: "secret" }, title: "private", nested: { description: "private" },
    count: 2,
  });
  emitAuditEvent(logger, "video_metadata.apply.invalid", { operationId: "op-2" });
  assert.deepEqual(calls, [{ event: "video_metadata.apply.start", context: { operationId: "op-1", channelId: "UC_1", dryRun: true, count: 2 } }]);
});

test("audit logger failures never change operation outcome", () => {
  assert.doesNotThrow(() => emitAuditEvent({ info: () => { throw Error("logger failed"); }, error: () => { throw Error("logger failed"); } }, "playlist.create.failure", { code: "update_failed" }));
});

test("default logger emits only filtered audit context", () => {
  const original = process.stderr.write;
  const lines: string[] = [];
  process.stderr.write = ((line: string) => { lines.push(line); return true; }) as typeof process.stderr.write;
  try {
    emitAuditEvent(createDefaultLogger(), "transcript.get.success", { operationId: "op", text: "secret" });
  } finally {
    process.stderr.write = original;
  }
  assert.equal(lines.length, 1);
  const line = JSON.parse(lines[0]!);
  assert.equal(line.event, "transcript.get.success");
  assert.deepEqual(line.context, { operationId: "op" });
  assert.equal(typeof line.timestamp, "string");
});
