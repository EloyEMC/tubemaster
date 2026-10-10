import assert from "node:assert/strict";
import test from "node:test";
import { createCapabilitiesGetHandler } from "./route";

const status = { platform: "macos" as const, ytDlp: false, ffmpeg: true, whisper: false, whisperBackend: "mlx_whisper" as const };

test("requires authentication before probing capabilities", async () => {
  let called = false;
  const response = await createCapabilitiesGetHandler({
    getSession: async () => null,
    detect: async () => { called = true; return status; },
  })();
  assert.equal(response.status, 401);
  assert.equal(called, false);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("returns only sanitized capability flags and never caches them", async () => {
  const response = await createCapabilitiesGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    detect: async () => status,
  })();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), status);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("does not disclose detector errors", async () => {
  const response = await createCapabilitiesGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    detect: async () => { throw new Error("secret path"); },
  })();
  assert.equal(response.status, 500);
  assert.equal(JSON.stringify(await response.json()).includes("secret path"), false);
});
