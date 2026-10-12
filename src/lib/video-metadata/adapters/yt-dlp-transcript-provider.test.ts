import assert from "node:assert/strict";
import test from "node:test";
import { createYtDlpTranscriptProvider } from "./yt-dlp-transcript-provider";

const videoId = "abcdefghijk";

test("manual captions precede auto captions and normalize VTT", async () => {
  const calls: string[][] = [];
  const provider = createYtDlpTranscriptProvider({ run: async (args) => {
    calls.push(args);
    return args.includes("--write-subs")
      ? { exitCode: 1, stdout: "", stderr: "no subtitles" }
      : { exitCode: 0, stdout: "WEBVTT\n\ncue-id\n00:00:00.000 --> 00:00:01.000\n<b>Hello</b>\n", stderr: "" };
  } });
  assert.deepEqual(await provider.getTranscript({ videoId }), { status: "available", text: "Hello", language: "en" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.at(-1), `https://www.youtube.com/watch?v=${videoId}`);
});

test("process failures are sanitized and never fall back", async () => {
  const provider = createYtDlpTranscriptProvider({ run: async () => { throw new Error("secret token"); } });
  const result = await provider.getTranscript({ videoId });
  assert.deepEqual(result, { status: "unavailable", reason: "unknown", diagnostic: { stage: "public-video", errorCode: "process-error", retriable: true } });
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});

test("rejects non-video inputs without running a command", async () => {
  const provider = createYtDlpTranscriptProvider({ run: async () => { throw new Error("must not run"); } });
  assert.deepEqual(await provider.getTranscript({ videoId: "https://example.com" }), { status: "unavailable", reason: "no-captions" });
});
