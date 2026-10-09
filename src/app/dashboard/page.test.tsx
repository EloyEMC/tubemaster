import assert from "node:assert/strict";
import test from "node:test";
import { channelThumbnailCandidates, nextChannelThumbnail, selectChannelThumbnail } from "../../components/channel-thumbnail";

test("keeps usable YouTube thumbnails in default, medium, high order without duplicates", () => {
  const candidates = channelThumbnailCandidates({
    default: { url: " https://example.com/default " },
    medium: { url: "https://example.com/medium" },
    high: { url: "https://example.com/high" },
  });
  assert.deepEqual(candidates, ["https://example.com/default", "https://example.com/medium", "https://example.com/high"]);
  assert.equal(selectChannelThumbnail({ default: { url: candidates[0] } }), candidates[0]);
  assert.deepEqual(channelThumbnailCandidates({ default: { url: "bad" }, medium: { url: "https://example.com/medium" }, high: { url: "https://example.com/medium" } }), ["https://example.com/medium"]);
  assert.deepEqual(channelThumbnailCandidates({ high: { url: " " } }), []);
});

test("advances only through channel candidates and hides after the last error", () => {
  const candidates = ["https://example.com/default", "https://example.com/medium", "https://example.com/high"];
  assert.equal(nextChannelThumbnail(candidates, candidates[0]), candidates[1]);
  assert.equal(nextChannelThumbnail(candidates, candidates[1]), candidates[2]);
  assert.equal(nextChannelThumbnail(candidates, candidates[2]), undefined);
  assert.equal(nextChannelThumbnail([candidates[0]], candidates[0]), undefined);
  assert.equal(nextChannelThumbnail([], candidates[0]), undefined);
  assert.equal(nextChannelThumbnail(candidates, "https://example.com/old-channel"), candidates[0]);
});
