import assert from "node:assert/strict";
import test from "node:test";
import { formatTranscriptResult } from "./transcript-dashboard";

test("formats local Whisper segments in start order with readable timestamps", () => {
  assert.equal(formatTranscriptResult({
    status: "available",
    source: "local-whisper",
    text: "fallback",
    segments: [
      { start: 7.9, end: 9, text: "second" },
      { start: 0, end: 2, text: "first" },
      { start: 3661, end: 3662, text: "hour" },
    ],
  }), "[00:00] first\n[00:07] second\n[01:01:01] hour");
});

test("preserves plain text for captions and local Whisper without usable segments", () => {
  assert.equal(formatTranscriptResult({ status: "available", text: "Caption line", source: "captions" }), "Caption line");
  assert.equal(formatTranscriptResult({ status: "available", text: "Plain local transcript", source: "local-whisper" }), "Plain local transcript");
  assert.equal(formatTranscriptResult({
    status: "available",
    text: "Malformed local transcript",
    source: "local-whisper",
    segments: [{ start: Number.NaN, end: 1, text: "bad" }],
  }), "Malformed local transcript");
});
