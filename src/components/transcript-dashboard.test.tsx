import assert from "node:assert/strict";
import test from "node:test";
import { normalizeVideoId, requestTranscript, transcriptDisplayText } from "./transcript-dashboard";

const id = "dQw4w9WgXcQ";

test("normalizes supported YouTube links and exact video IDs", () => {
  for (const input of [id, `https://www.youtube.com/watch?v=${id}&t=5`, `https://youtu.be/${id}`, `https://youtube.com/shorts/${id}`, `https://youtube.com/embed/${id}`, `https://youtube.com/live/${id}`]) {
    assert.equal(normalizeVideoId(input), id);
  }
  for (const input of ["short", `https://evil.example/watch?v=${id}`, `https://youtube.com.evil.example/watch?v=${id}`, `https://youtube.com/watch?v=${id}extra`, `https://youtube.com/watch?v=${id}/${id}`]) {
    assert.equal(normalizeVideoId(input), null);
  }
});

test("sends only the normalized ID and explicitly selected provider", async () => {
  for (const provider of ["youtube-captions", "yt-dlp"] as const) {
    let request: { url: string; init: RequestInit } | undefined;
    const transcript = await requestTranscript(id, provider, async (url, init) => {
      request = { url: String(url), init: init! };
      return Response.json({ transcript: { status: "available", text: "hello", language: "en" } });
    });
    assert.deepEqual(transcript, { status: "available", text: "hello", language: "en" });
    assert.equal(request?.url, "/api/video-metadata/transcript");
    assert.equal(request?.init.method, "POST");
    assert.deepEqual(JSON.parse(String(request?.init.body)), { videoId: id, provider });
  }
});

test("shows loading, transcript language, no captions and unsupported states", () => {
  assert.equal(transcriptDisplayText(null, null, true), "Loading transcript...");
  assert.equal(transcriptDisplayText({ status: "available", text: "hello", language: "en" }, null, false), "Available · en");
  assert.equal(transcriptDisplayText({ status: "unavailable", reason: "no-captions" }, null, false), "No captions are available for this video.");
  assert.equal(transcriptDisplayText({ status: "unsupported", reason: "unsupported-provider" }, null, false), "This transcript provider is unsupported.");
});

test("distinguishes auth from generic API and network failures", async () => {
  await assert.rejects(requestTranscript(id, "yt-dlp", async () => Response.json({ error: "Unauthorized" }, { status: 401 })), /Sign in/);
  await assert.rejects(requestTranscript(id, "yt-dlp", async () => Response.json({ error: "internal_error" }, { status: 500 })), /Unable to load transcript/);
  assert.equal(transcriptDisplayText(null, "Unable to load transcript.", false), "Unable to load transcript.");
});
