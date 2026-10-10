import assert from "node:assert/strict";
import test from "node:test";
import { detectRuntimeCapabilities, commandAvailable } from "./runtime-capabilities";

test("maps command presence and default backend without executing commands", async () => {
  const checked: string[] = [];
  const result = await detectRuntimeCapabilities({ TUBEMASTER_WHISPER_COMMAND: "/private/whisper" }, "darwin", async (command) => {
    checked.push(command);
    return command === "yt-dlp";
  });
  assert.deepEqual(checked, ["yt-dlp", "ffmpeg", "/private/whisper"]);
  assert.deepEqual(result, { platform: "macos", ytDlp: true, ffmpeg: false, whisper: false, whisperBackend: "mlx_whisper" });
  assert.equal(JSON.stringify(result).includes("/private/whisper"), false);
});

test("uses default command and rejects unsupported backend without probing it", async () => {
  const checked: string[] = [];
  const available = async (command: string) => { checked.push(command); return true; };
  assert.equal((await detectRuntimeCapabilities({}, "linux", available)).whisper, true);
  assert.deepEqual(checked, ["yt-dlp", "ffmpeg", "mlx_whisper"]);
  checked.length = 0;
  const result = await detectRuntimeCapabilities({ TUBEMASTER_WHISPER_BACKEND: "private-backend" }, "win32", available);
  assert.deepEqual(checked, ["yt-dlp", "ffmpeg"]);
  assert.equal(result.whisper, false);
  assert.equal(result.whisperBackend, "unsupported");
  assert.equal(result.platform, "windows");
});

test("does not interpret command strings as shell instructions", async () => {
  assert.equal(await commandAvailable("echo secret; true", { PATH: "" }), false);
  assert.equal(await commandAvailable("../secret", { PATH: "/usr/bin" }), false);
});
