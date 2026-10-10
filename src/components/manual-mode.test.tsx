import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlaylistId } from "./manual-mode";

test("resolvePlaylistId accepts pasted IDs and playlist URLs", () => {
  assert.equal(resolvePlaylistId(" PL123 "), "PL123");
  assert.equal(resolvePlaylistId("https://youtube.com/playlist?list=PL123&foo=1"), "PL123");
  assert.equal(resolvePlaylistId("https://youtube.com/watch?v=video&list=PL456"), "PL456");
  assert.equal(resolvePlaylistId("https://youtube.com/playlist?foo=1&list=PL_abc-123"), "PL_abc-123");
});

test("resolvePlaylistId rejects video URLs without a playlist and malformed inputs", () => {
  assert.equal(resolvePlaylistId("https://youtube.com/watch?v=dQw4w9WgXcQ"), "");
  assert.equal(resolvePlaylistId("https://youtu.be/dQw4w9WgXcQ"), "");
  assert.equal(resolvePlaylistId("https://youtube.com/playlist?list="), "");
  assert.equal(resolvePlaylistId("https://youtube.com/playlist?list=PL123%20bad"), "");
  assert.equal(resolvePlaylistId("not a playlist"), "");
});
