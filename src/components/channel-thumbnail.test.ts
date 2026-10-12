import assert from "node:assert/strict";
import test from "node:test";
import { channelThumbnailCandidates, nextChannelThumbnail } from "./channel-thumbnail";

test("orders usable channel images high to default and removes duplicates", () => {
  assert.deepEqual(channelThumbnailCandidates({
    default: { url: "https://example.com/default" },
    medium: { url: " https://example.com/medium " },
    high: { url: "https://example.com/high" },
  }), ["https://example.com/high", "https://example.com/medium", "https://example.com/default"]);
  assert.deepEqual(channelThumbnailCandidates({
    high: { url: "javascript:bad" },
    medium: { url: "https://example.com/same" },
    default: { url: "https://example.com/same" },
  }), ["https://example.com/same"]);
  assert.deepEqual(channelThumbnailCandidates(null), []);
});

test("advances on failure and exhausts without retrying a broken image", () => {
  const candidates = ["https://example.com/high", "https://example.com/medium"];
  assert.equal(nextChannelThumbnail(candidates, candidates[0]), candidates[1]);
  assert.equal(nextChannelThumbnail(candidates, candidates[1]), undefined);
  assert.equal(nextChannelThumbnail([], candidates[0]), undefined);
  assert.equal(nextChannelThumbnail(candidates, "https://example.com/old"), candidates[0]);
});
