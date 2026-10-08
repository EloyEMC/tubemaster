import assert from "node:assert/strict";
import test from "node:test";
import { createYtDlpTranscriptProvider } from "./yt-dlp-transcript-provider";

test("yt-dlp provider prefers manual captions and normalizes VTT", async () => {
  const calls: string[][] = [];
  const provider = createYtDlpTranscriptProvider({
    run: async (args) => {
      calls.push(args);
      return { exitCode: 0, stdout: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nManual caption\n", stderr: "" };
    },
    languages: ["es", "en"],
  });

  const result = await provider.getTranscript({ videoId: "video-1" });

  assert.deepEqual(result, { status: "available", text: "Manual caption", language: "es" });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    "--skip-download",
    "--no-warnings",
    "--write-subs",
    "--sub-langs",
    "es",
    "--sub-format",
    "vtt/srt",
    "--output",
    "-",
    "https://www.youtube.com/watch?v=video-1",
  ]);
});

    test("yt-dlp provider removes WebVTT cue identifiers before caption text", async () => {
      const provider = createYtDlpTranscriptProvider({
        run: async () => ({
          exitCode: 0,
          stdout: "WEBVTT\n\nexternal-cue-id\n00:00:00.000 --> 00:00:01.000\nCaption text",
          stderr: "",
        }),
        languages: ["en"],
      });

      const result = await provider.getTranscript({ videoId: "video-1" });

      assert.deepEqual(result, { status: "available", text: "Caption text", language: "en" });
    });

    test("yt-dlp provider tries languages in order and auto captions after manual captions", async () => {
  const calls: string[][] = [];
  const provider = createYtDlpTranscriptProvider({
    run: async (args) => {
      calls.push(args);
      if (args.includes("--write-auto-subs") && args[args.indexOf("--sub-langs") + 1] === "en") {
        return { exitCode: 0, stdout: "1\n00:00:00,000 --> 00:00:01,000\nAuto caption", stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "no subtitles" };
    },
    languages: ["fr", "en"],
  });

  const result = await provider.getTranscript({ videoId: "https://youtu.be/abc" });

  assert.deepEqual(result, { status: "available", text: "Auto caption", language: "en" });
  assert.deepEqual(calls.map((args) => args[args.indexOf("--sub-langs") + 1]), ["fr", "fr", "en", "en"]);
  assert.equal(calls[2].includes("--write-auto-subs"), false);
  assert.equal(calls[3].includes("--write-auto-subs"), true);
});

test("yt-dlp provider maps missing captions, timeout, exit, and malformed output safely", async () => {
  const cases = [
    { result: { exitCode: 1, stdout: "", stderr: "no subtitles token=secret" }, reason: "no-captions" },
    { result: new Error("timeout"), reason: "unknown" },
    { result: { exitCode: 2, stdout: "", stderr: "ERROR: https://private.example secret" }, reason: "unknown" },
    { result: { exitCode: 0, stdout: "not captions", stderr: "" }, reason: "unknown" },
  ] as const;

  for (const current of cases) {
    const provider = createYtDlpTranscriptProvider({
      run: async () => {
        if (current.result instanceof Error) throw Object.assign(current.result, { code: "ETIMEDOUT" });
        return current.result;
      },
      timeoutMs: 1,
    });
    const result = await provider.getTranscript({ videoId: "video-1" });
    assert.equal(result.status, "unavailable");
    if (result.status === "unavailable") {
      assert.equal(result.reason, current.reason);
      assert.doesNotMatch(JSON.stringify(result), /secret|private\.example/);
    }
  }
});
