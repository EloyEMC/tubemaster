import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultLogger } from "./logger";

test("redacts prompt and provider error content recursively while preserving safe event fields", () => {
  const writes: string[] = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    writes.push(chunk.toString());
    return true;
  }) as typeof process.stderr.write;

  try {
    createDefaultLogger().error({
      event: "video_metadata.apply_failed",
      context: {
        operationId: "op-1",
        channelId: "channel-1",
        videoId: "video-1",
        dryRun: false,
        expectedChannelId: "channel-1",
        status: "failed",
        errorCode: "generation_failed",
        prompt: "sensitive prompt content",
        editorialPrompt: {
          nested: "sensitive editorial prompt content",
        },
        providerError: {
          message: "sensitive provider message",
          details: [
            { error: "sensitive nested provider error" },
            "sensitive array provider error",
          ],
        },
        safeNested: [
          {
            message: "sensitive nested message",
            status: "failed",
          },
          {
            error: "sensitive nested error",
            status: "failed",
          },
        ],
      },
    });
  } finally {
    process.stderr.write = originalWrite;
  }

  assert.equal(writes.length, 1);
  const line = JSON.parse(writes[0]);
  assert.deepEqual(
    {
      event: line.event,
      operationId: line.context.operationId,
      channelId: line.context.channelId,
      videoId: line.context.videoId,
      dryRun: line.context.dryRun,
      expectedChannelId: line.context.expectedChannelId,
      status: line.context.status,
      errorCode: line.context.errorCode,
    },
    {
      event: "video_metadata.apply_failed",
      operationId: "op-1",
      channelId: "channel-1",
      videoId: "video-1",
      dryRun: false,
      expectedChannelId: "channel-1",
      status: "failed",
      errorCode: "generation_failed",
    },
  );
  assert.equal(line.context.prompt, "[redacted]");
  assert.deepEqual(line.context.editorialPrompt, "[redacted]");
  assert.deepEqual(line.context.providerError, "[redacted]");
  assert.deepEqual(line.context.safeNested, [
    {
      message: "[redacted]",
      status: "failed",
    },
    {
      error: "[redacted]",
      status: "failed",
    },
  ]);
  assert.doesNotMatch(writes[0], /sensitive/);
});
