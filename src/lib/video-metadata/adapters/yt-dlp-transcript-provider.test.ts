import assert from "node:assert/strict";
import test from "node:test";
import { transcriptResultSchema } from "../schemas";
import { createYtDlpTranscriptProvider, parseWhisperOutput } from "./yt-dlp-transcript-provider";

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

test("yt-dlp provider uses local Whisper after captions are unavailable", async () => {
  const calls: string[][] = [];
  let transcribeCalls = 0;
  const provider = createYtDlpTranscriptProvider({
    run: async (args) => {
      calls.push(args);
      if (args.includes("--extract-audio")) return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 1, stdout: "", stderr: "no subtitles" };
    },
    transcribe: async (audioPath) => {
      transcribeCalls += 1;
      assert.match(audioPath, /audio\.wav$/);
      return "Locally transcribed";
    },
    languages: ["en"],
  });

  const result = await provider.getTranscript({ videoId: "video-1" });

  assert.deepEqual(result, { status: "available", text: "Locally transcribed", source: "local-whisper" });
  assert.equal(transcribeCalls, 1);
  assert.equal(calls.filter((args) => args.includes("--extract-audio")).length, 1);
      const audioCall = calls.find((args) => args.includes("--extract-audio"));
      if (!audioCall) throw new Error("Expected an audio download invocation");
      assert.deepEqual(audioCall.slice(0, 8), [
        "--no-playlist",
        "--no-warnings",
        "--format",
        "bestaudio/best",
        "--extract-audio",
        "--audio-format",
        "wav",
        "--output",
      ]);
      assert.equal(audioCall.includes("--format"), true);
      assert.equal(audioCall[audioCall.indexOf("--format") + 1], "bestaudio/best");
      assert.ok(audioCall.includes("--audio-format") && audioCall.includes("wav"));
});

test("yt-dlp provider keeps captions fast path available with invalid Whisper backend configuration", async () => {
  const previousBackend = process.env.TUBEMASTER_WHISPER_BACKEND;
  const previousCommand = process.env.TUBEMASTER_WHISPER_COMMAND;
  process.env.TUBEMASTER_WHISPER_BACKEND = "unsupported-backend";
  delete process.env.TUBEMASTER_WHISPER_COMMAND;
  try {
    let audioCalls = 0;
    const provider = createYtDlpTranscriptProvider({
      run: async (args) => {
        if (args.includes("--extract-audio")) audioCalls += 1;
        return { exitCode: 0, stdout: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nCaption", stderr: "" };
      },
    });

    assert.deepEqual(await provider.getTranscript({ videoId: "video-1" }), {
      status: "available",
      text: "Caption",
      language: "en",
    });
    assert.equal(audioCalls, 0);
  } finally {
    if (previousBackend === undefined) delete process.env.TUBEMASTER_WHISPER_BACKEND;
    else process.env.TUBEMASTER_WHISPER_BACKEND = previousBackend;
    if (previousCommand === undefined) delete process.env.TUBEMASTER_WHISPER_COMMAND;
    else process.env.TUBEMASTER_WHISPER_COMMAND = previousCommand;
  }
});

test("yt-dlp provider does not download audio when captions succeed", async () => {
  let audioCalls = 0;
  let transcribeCalls = 0;
  const provider = createYtDlpTranscriptProvider({
    run: async (args) => {
      if (args.includes("--extract-audio")) audioCalls += 1;
      return { exitCode: 0, stdout: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nCaption", stderr: "" };
    },
    transcribe: async () => { transcribeCalls += 1; return "unexpected"; },
  });

  const result = await provider.getTranscript({ videoId: "video-1" });

  assert.deepEqual(result, { status: "available", text: "Caption", language: "en" });
  assert.equal(audioCalls, 0);
  assert.equal(transcribeCalls, 0);
});

test("yt-dlp provider removes temporary audio directory after local transcription", async () => {
  let removed: string | undefined;
  const provider = createYtDlpTranscriptProvider({
    createTempDirectory: async () => "/tmp/tubemaster-test",
    removeTempDirectory: async (path) => { removed = path; },
    run: async (args) => args.includes("--extract-audio")
      ? { exitCode: 0, stdout: "", stderr: "" }
      : { exitCode: 1, stdout: "", stderr: "no subtitles" },
    transcribe: async () => "Cleaned up",
  });
  await provider.getTranscript({ videoId: "video-1" });
  assert.equal(removed, "/tmp/tubemaster-test");
});

test("yt-dlp provider classifies audio runner exceptions and cleans up temporary files", async () => {
  for (const [error, errorCode] of [
    [Object.assign(new Error("private timeout"), { code: "ETIMEDOUT" }), "timeout"],
    [new Error("private process failure"), "process-error"],
  ] as const) {
    let removed: string | undefined;
    let transcriptionCalls = 0;
    const provider = createYtDlpTranscriptProvider({
      createTempDirectory: async () => "/tmp/tubemaster-audio-failure-test",
      removeTempDirectory: async (path) => { removed = path; },
      run: async (args) => {
        if (args.includes("--extract-audio")) throw error;
        return { exitCode: 1, stdout: "", stderr: "no subtitles" };
      },
      transcribe: async () => { transcriptionCalls += 1; return "unexpected"; },
    });
    const result = await provider.getTranscript({ videoId: "video-1" });
    assert.deepEqual(result, {
      status: "unavailable",
      reason: "unknown",
      diagnostic: { stage: "local-audio", errorCode, retriable: true },
    });
    assert.equal(removed, "/tmp/tubemaster-audio-failure-test");
    assert.equal(transcriptionCalls, 0);
    assert.doesNotMatch(JSON.stringify(result), /private/);
  }
});

test("yt-dlp provider reports local audio and Whisper failures without leaking errors", async () => {
  const audioFailure = createYtDlpTranscriptProvider({
    run: async (args) => args.includes("--extract-audio")
      ? { exitCode: 1, stdout: "", stderr: "secret-url token" }
      : { exitCode: 1, stdout: "", stderr: "no subtitles" },
    transcribe: async () => "unused",
  });
  const audioResult = await audioFailure.getTranscript({ videoId: "video-1" });
  assert.deepEqual(audioResult, {
    status: "unavailable",
    reason: "unknown",
    diagnostic: { stage: "local-audio", errorCode: "non-zero-exit", retriable: true },
  });

  const whisperFailure = createYtDlpTranscriptProvider({
    run: async (args) => args.includes("--extract-audio")
      ? { exitCode: 0, stdout: "", stderr: "" }
      : { exitCode: 1, stdout: "", stderr: "no subtitles" },
    transcribe: async () => { throw Object.assign(new Error("secret"), { code: "ETIMEDOUT" }); },
  });
  const whisperResult = await whisperFailure.getTranscript({ videoId: "video-1" });
  assert.deepEqual(whisperResult, {
    status: "unavailable",
    reason: "unknown",
    diagnostic: { stage: "local-transcription", errorCode: "timeout", retriable: true },
  });
});

test("transcript schema accepts optional segments and rejects reversed segment ranges", () => {
  const valid = transcriptResultSchema.parse({
    status: "available",
    text: "Timed transcript",
    segments: [{ start: 1, end: 1, text: "Timed" }],
  });
  assert.equal(valid.status, "available");
  if (valid.status !== "available") throw new Error("Expected an available transcript");
  assert.deepEqual(valid.segments, [{ start: 1, end: 1, text: "Timed" }]);
  assert.throws(() => transcriptResultSchema.parse({
    status: "available",
    text: "Invalid timing",
    segments: [{ start: 2, end: 1, text: "Reversed" }],
  }));
});

test("transcript schema accepts local Whisper source and diagnostics", () => {
  assert.deepEqual(transcriptResultSchema.parse({
    status: "available",
    text: "Local transcript",
    source: "local-whisper",
  }), {
    status: "available",
    text: "Local transcript",
    source: "local-whisper",
  });
  const unavailable = transcriptResultSchema.parse({
    status: "unavailable",
    reason: "unknown",
    diagnostic: { stage: "local-transcription", errorCode: "timeout", retriable: true },
  });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.diagnostic?.stage, "local-transcription");
});

test("yt-dlp provider falls back to local Whisper after successful malformed captions", async () => {
  let audioCalls = 0;
  let transcribeCalls = 0;
  const provider = createYtDlpTranscriptProvider({
    languages: ["en"],
    run: async (args) => {
      if (args.includes("--extract-audio")) {
        audioCalls += 1;
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    transcribe: async () => {
      transcribeCalls += 1;
      return "Recovered locally";
    },
  });

  const result = await provider.getTranscript({ videoId: "video-1" });

  assert.deepEqual(result, { status: "available", text: "Recovered locally", source: "local-whisper" });
  assert.equal(audioCalls, 1);
  assert.equal(transcribeCalls, 1);
});

    test("parses MLX Whisper segment timing metadata", () => {
      assert.deepEqual(parseWhisperOutput(JSON.stringify({
        text: "first second",
        segments: [
          { start: 0.4, end: 1.2, text: "first" },
          { start: 1.2, end: 2.8, text: " second" },
        ],
      })), {
        text: "first second",
        segments: [
          { start: 0.4, end: 1.2, text: "first" },
          { start: 1.2, end: 2.8, text: " second" },
        ],
      });
    });

    test("falls back to plain Whisper text when segments are missing or malformed", () => {
      assert.deepEqual(parseWhisperOutput(JSON.stringify({ text: "plain transcript" })), { text: "plain transcript" });
      assert.deepEqual(parseWhisperOutput(JSON.stringify({
        text: "plain transcript",
        segments: [{ start: "bad", end: 1, text: "ignored" }],
      })), { text: "plain transcript" });
    });

    test("yt-dlp provider invokes MLX with exact output-file arguments and parses JSON", async () => {
  const whisperCalls: { args: string[]; timeoutMs: number }[] = [];
  const provider = createYtDlpTranscriptProvider({
    whisperModel: "mlx-community/whisper-small",
    createTempDirectory: async () => "/tmp/tubemaster-config-test",
    run: async (args) => args.includes("--extract-audio")
      ? { exitCode: 0, stdout: "", stderr: "" }
      : { exitCode: 1, stdout: "", stderr: "no subtitles" },
    whisperRun: async (args, timeoutMs) => {
      whisperCalls.push({ args, timeoutMs });
      return { exitCode: 0, stdout: "misleading stdout", stderr: "" };
    },
    readWhisperOutput: async (path) => {
      assert.equal(path, "/tmp/tubemaster-config-test/transcript.json");
      return JSON.stringify({ text: "Configured transcript" });
    },
    timeoutMs: 300000,
  });

  const result = await provider.getTranscript({ videoId: "video-1" });

  assert.deepEqual(result, { status: "available", text: "Configured transcript", source: "local-whisper" });
  assert.deepEqual(whisperCalls, [{
    args: [
      "/tmp/tubemaster-config-test/audio.wav",
      "--model",
      "mlx-community/whisper-small",
      "--output-dir",
      "/tmp/tubemaster-config-test",
      "--output-name",
      "transcript",
      "--output-format",
      "json",
    ],
    timeoutMs: 300000,
  }]);
});

test("yt-dlp provider accepts an injected Whisper command for faster-whisper", async () => {
  const previousBackend = process.env.TUBEMASTER_WHISPER_BACKEND;
  const previousCommand = process.env.TUBEMASTER_WHISPER_COMMAND;
  process.env.TUBEMASTER_WHISPER_BACKEND = "faster-whisper";
  delete process.env.TUBEMASTER_WHISPER_COMMAND;
  try {
    const provider = createYtDlpTranscriptProvider({
      whisperCommand: "faster-whisper",
      run: async (args) => args.includes("--extract-audio")
? { exitCode: 0, stdout: "", stderr: "" }
: { exitCode: 1, stdout: "", stderr: "no subtitles" },
      whisperRun: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      readWhisperOutput: async () => JSON.stringify({ text: "Faster transcript" }),
    });
    assert.deepEqual(await provider.getTranscript({ videoId: "video-1" }), {
      status: "available",
      text: "Faster transcript",
      source: "local-whisper",
    });
  } finally {
    if (previousBackend === undefined) delete process.env.TUBEMASTER_WHISPER_BACKEND;
    else process.env.TUBEMASTER_WHISPER_BACKEND = previousBackend;
    if (previousCommand === undefined) delete process.env.TUBEMASTER_WHISPER_COMMAND;
    else process.env.TUBEMASTER_WHISPER_COMMAND = previousCommand;
  }
});

test("yt-dlp provider maps missing captions, timeout, and exit safely", async () => {
  const cases = [
    { result: { exitCode: 1, stdout: "", stderr: "no subtitles token=secret" }, reason: "unknown" },
    { result: new Error("timeout"), reason: "unknown" },
    { result: { exitCode: 2, stdout: "", stderr: "ERROR: https://private.example secret" }, reason: "unknown" },
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
