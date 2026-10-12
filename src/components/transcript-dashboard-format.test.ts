import assert from "node:assert/strict";
import test from "node:test";
import { formatTranscriptResult } from "./transcript-dashboard-format";
import { transcriptResultSchema } from "@/lib/video-metadata/schemas";

test("formats local Whisper segments in start order with readable timestamps without mutating timing", () => {
  const segments = [
    { start: 7.9, end: 9, text: " second " },
    { start: 0, end: 2, text: "first" },
    { start: 3661, end: 3662, text: "hour" },
  ];
  const transcript = { status: "available" as const, source: "local-whisper" as const, text: "fallback", segments };
  assert.equal(formatTranscriptResult(transcript), "[00:00] first\n[00:07] second\n[01:01:01] hour");
  assert.deepEqual(segments.map((segment) => segment.start), [7.9, 0, 3661]);
  assert.deepEqual(transcriptResultSchema.parse(transcript), transcript);
});

test("keeps plain text for captions and local Whisper without usable segments", () => {
  assert.equal(formatTranscriptResult({ status: "available", text: "Caption line", source: "captions", segments: [{ start: 0, end: 1, text: "ignored" }] }), "Caption line");
  assert.equal(formatTranscriptResult({ status: "available", text: "Plain local transcript", source: "local-whisper" }), "Plain local transcript");
  assert.equal(formatTranscriptResult({ status: "available", text: "fallback", source: "local-whisper", segments: [{ start: NaN, end: 1, text: "bad" }] }), "fallback");
  assert.equal(transcriptResultSchema.safeParse({ status: "available", text: "x", segments: [{ start: 2, end: 1, text: "invalid" }] }).success, false);
});
