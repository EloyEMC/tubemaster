import assert from "node:assert/strict";
import test from "node:test";
import { capabilitySetupMessages, transcriptDisplayText } from "./transcript-dashboard";

test("guided setup only lists missing tools with platform-safe suggestions", () => {
  assert.deepEqual(capabilitySetupMessages({ platform: "macos", ytDlp: false, ffmpeg: true, whisper: false, whisperBackend: "mlx_whisper" }), [
    "yt-dlp: brew install yt-dlp", "Whisper: python3 -m pip install mlx-whisper",
  ]);
  assert.deepEqual(capabilitySetupMessages({ platform: "windows", ytDlp: true, ffmpeg: false, whisper: false, whisperBackend: "unsupported" }), [
    "ffmpeg: winget install Gyan.FFmpeg", "Whisper: configure the supported mlx_whisper backend.",
  ]);
  assert.deepEqual(capabilitySetupMessages({ platform: "linux", ytDlp: true, ffmpeg: true, whisper: true, whisperBackend: "mlx_whisper" }), []);
  assert.deepEqual(capabilitySetupMessages({ platform: "linux", ytDlp: false, ffmpeg: false, whisper: false, whisperBackend: "mlx_whisper" }), [
    "yt-dlp: python3 -m pip install yt-dlp", "ffmpeg: sudo apt install ffmpeg", "Whisper: Install a supported mlx_whisper backend on a compatible host.",
  ]);
});

test("transcript dashboard maps acquisition states to display text", () => {
  assert.equal(transcriptDisplayText({ status: "available", text: "captions", language: "en" }, null, false), "Available · en");
  assert.equal(transcriptDisplayText({ status: "available", text: "captions" }, null, false), "Available");
  assert.equal(transcriptDisplayText({ status: "unavailable", reason: "no-captions" }, null, false), "No captions are available for this video. Try YouTube captions or configure local Whisper (mlx-whisper or faster-whisper).");
  assert.equal(transcriptDisplayText({ status: "unavailable", reason: "no-captions", diagnostic: { stage: "local-transcription", errorCode: "configuration-error" } }, null, false), "yt-dlp/ffmpeg may be available, but a local Whisper backend (mlx-whisper or faster-whisper) is not configured. Configure one to transcribe this video.");
  assert.equal(transcriptDisplayText({ status: "unavailable", reason: "captions-not-downloadable", diagnostic: { stage: "captions-download", errorCode: "timeout", apiReason: "secret-token" } }, null, false), "The transcript is currently unavailable (captions-download: timeout). Try again or use another transcript provider.");
  assert.equal(transcriptDisplayText({ status: "unavailable", reason: "unknown", diagnostic: { stage: "unsafe secret", errorCode: "token=secret" } }, null, false), "The transcript is currently unavailable. Try again or use another transcript provider.");
  assert.equal(transcriptDisplayText({ status: "unsupported", reason: "provider-missing" }, null, false), "This transcript provider is unsupported.");
  assert.equal(transcriptDisplayText(null, "Sign in to use the transcript dashboard.", false), "Sign in to use the transcript dashboard.");
  assert.equal(transcriptDisplayText(null, "Unable to load transcript.", false), "Unable to load transcript.");
  assert.equal(transcriptDisplayText(null, null, true), "Loading transcript...");
  assert.equal(transcriptDisplayText(null, null, false), null);
});
