import assert from "node:assert/strict";
import test from "node:test";
import { channelThumbnailCandidates, nextChannelThumbnail, withProfileImageFallback } from "./channel-thumbnail";

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

test("tries a distinct HTTPS profile image last, then hides the image on failure", () => {
  const youtube = ["https://example.com/high", "https://example.com/default"];
  const candidates = withProfileImageFallback(youtube, " https://example.com/profile ");
  assert.deepEqual(candidates, [...youtube, "https://example.com/profile"]);
  assert.equal(nextChannelThumbnail(candidates, youtube[0]), youtube[1]);
  assert.equal(nextChannelThumbnail(candidates, youtube[1]), "https://example.com/profile");
  assert.equal(nextChannelThumbnail(candidates, "https://example.com/profile"), undefined);
  assert.deepEqual(withProfileImageFallback([], "https://example.com/profile"), ["https://example.com/profile"]);
  for (const invalid of [null, "", "https://", "http://example.com/profile", "javascript:bad", youtube[0]]) {
    assert.deepEqual(withProfileImageFallback(youtube, invalid), youtube);
  }
});

test("advances on failure and exhausts without retrying a broken image", () => {
  const candidates = ["https://example.com/high", "https://example.com/medium"];
  assert.equal(nextChannelThumbnail(candidates, candidates[0]), candidates[1]);
  assert.equal(nextChannelThumbnail(candidates, candidates[1]), undefined);
  assert.equal(nextChannelThumbnail([], candidates[0]), undefined);
  assert.equal(nextChannelThumbnail(candidates, "https://example.com/old"), candidates[0]);
});
