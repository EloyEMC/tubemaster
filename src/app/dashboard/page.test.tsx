import assert from "node:assert/strict";
import test from "node:test";
import { fallbackChannelThumbnail, selectChannelThumbnail } from "../../components/channel-thumbnail";

test("selects the first usable YouTube thumbnail in priority order", () => {
  assert.equal(selectChannelThumbnail({ default: { url: "https://example.com/default" }, medium: { url: "https://example.com/medium" } }), "https://example.com/default");
  assert.equal(selectChannelThumbnail({ default: { url: " " }, medium: { url: "https://example.com/medium" } }), "https://example.com/medium");
  assert.equal(selectChannelThumbnail({ default: { url: "bad" }, high: { url: "https://example.com/high" } }), "https://example.com/high");
  assert.equal(selectChannelThumbnail({ high: { url: "" } }), undefined);
});

test("falls back to the session image only after the primary fails", () => {
  const primary = "https://example.com/channel";
  const image = "https://example.com/session";
  assert.equal(fallbackChannelThumbnail(primary, image, primary), image);
  assert.equal(fallbackChannelThumbnail(primary, image, image), undefined);
  assert.equal(fallbackChannelThumbnail(primary, primary, primary), undefined);
  assert.equal(fallbackChannelThumbnail(primary, null, primary), undefined);
  assert.equal(fallbackChannelThumbnail(primary, "javascript:bad", primary), undefined);
});
