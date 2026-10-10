import assert from "node:assert/strict";
import test from "node:test";
import { parseVideoId } from "./parse-video-id";

test("parseVideoId accepts YouTube URLs and video IDs", () => {
  assert.equal(parseVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseVideoId("https://youtu.be/dQw4w9WgXcQ?t=10"), "dQw4w9WgXcQ");
  assert.equal(parseVideoId("https://youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseVideoId("https://youtube.com/v/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseVideoId("https://youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(parseVideoId("not valid"), null);
});

test("parseVideoId rejects non-YouTube hosts and host-like prefixes", () => {
  assert.equal(parseVideoId("https://notyoutube.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseVideoId("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseVideoId("https://youtu.be.evil.example/dQw4w9WgXcQ"), null);
});

test("parseVideoId rejects malformed URLs, wrong paths, and invalid IDs", () => {
  assert.equal(parseVideoId("https://youtube.com/watch"), null);
  assert.equal(parseVideoId("https://youtube.com/watch?v=short"), null);
  assert.equal(parseVideoId("https://youtube.com/embed/dQw4w9WgXcQ/extra"), null);
  assert.equal(parseVideoId("https://youtube.com/embed//dQw4w9WgXcQ"), null);
  assert.equal(parseVideoId("https://youtube.com/other/dQw4w9WgXcQ"), null);
  assert.equal(parseVideoId("https://youtu.be/invalid-id"), null);
  assert.equal(parseVideoId("https://youtube.com.evil.example/%ZZ"), null);
});
