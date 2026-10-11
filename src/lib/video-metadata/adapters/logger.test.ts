import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultLogger } from "./logger";

test("default audit logger emits only bounded context", () => {
  const originalWrite = process.stderr.write;
  const lines: string[] = [];
  process.stderr.write = ((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  try {
    createDefaultLogger().error({
      event: "video_metadata.apply.error",
      context: {
        operationId: "op-1",
        videoId: "video-1",
        expectedChannelId: "UC_ACTIVE",
        dryRun: false,
        code: "update_failed",
        description: "private description",
        transcript: "private transcript",
        accessToken: "private token",
        message: "raw provider error",
      },
    });
  } finally {
    process.stderr.write = originalWrite;
  }

  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
  assert.equal(entry.level, "error");
  assert.equal(entry.event, "video_metadata.apply.error");
  assert.equal(typeof entry.timestamp, "string");
  assert.deepEqual(entry.context, {
    operationId: "op-1",
    videoId: "video-1",
    expectedChannelId: "UC_ACTIVE",
    dryRun: false,
    code: "update_failed",
  });
});

test("default audit logger preserves playlist_management.update.error", () => {
  const originalWrite = process.stderr.write;
  const lines: string[] = [];
  process.stderr.write = ((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  try {
    createDefaultLogger().error({ event: "playlist_management.update.error" });
  } finally {
    process.stderr.write = originalWrite;
  }

  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
  assert.equal(entry.event, "playlist_management.update.error");
});
