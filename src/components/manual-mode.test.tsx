import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlaylistId } from "./manual-mode";

test("resolvePlaylistId accepts pasted IDs and playlist URLs", () => {
  assert.equal(resolvePlaylistId(" PL123 "), "PL123");
  assert.equal(resolvePlaylistId("https://youtube.com/playlist?list=PL123&foo=1"), "PL123");
  assert.equal(resolvePlaylistId("https://youtube.com/watch?v=video&list=PL456"), "PL456");
});
