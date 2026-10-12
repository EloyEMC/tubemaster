import assert from "node:assert/strict";
import test from "node:test";
import { access, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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

test("reads yt-dlp subtitle files and removes the temporary directory", async () => {
  let directory = "";
  const provider = createYtDlpTranscriptProvider({ run: async (args) => {
    const output = args[args.indexOf("--output") + 1];
    directory = dirname(output);
    await writeFile(`${output}.en.vtt`, "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nFrom file\n");
    return { exitCode: 0, stdout: "", stderr: "" };
  } });
  assert.deepEqual(await provider.getTranscript({ videoId }), { status: "available", text: "From file", language: "en" });
  await assert.rejects(access(directory));
});

test("reads SRT and cleans output after non-zero exits", async () => {
  const directories: string[] = [];
  const provider = createYtDlpTranscriptProvider({ run: async (args) => {
    const output = args[args.indexOf("--output") + 1];
    directories.push(dirname(output));
    if (args.includes("--write-subs")) return { exitCode: 1, stdout: "", stderr: "no subtitles" };
    await writeFile(`${output}.en.srt`, "1\n00:00:00,000 --> 00:00:01,000\nSRT caption\n");
    return { exitCode: 0, stdout: "", stderr: "" };
  } });
  assert.deepEqual(await provider.getTranscript({ videoId }), { status: "available", text: "SRT caption", language: "en" });
  assert.notEqual(directories[0], directories[1]);
  for (const directory of directories) await assert.rejects(access(directory));
});

test("cleans temporary output on command errors and preserves timeout mapping", async () => {
  let directory = "";
  const provider = createYtDlpTranscriptProvider({ run: async (args) => {
    directory = dirname(args[args.indexOf("--output") + 1]);
    throw Object.assign(new Error("private"), { code: "ETIMEDOUT" });
  } });
  assert.deepEqual(await provider.getTranscript({ videoId }), {
    status: "unavailable", reason: "unknown",
    diagnostic: { stage: "public-video", errorCode: "timeout", retriable: true },
  });
  await assert.rejects(access(directory));
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
