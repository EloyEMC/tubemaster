import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { channelThumbnailCandidates, nextChannelThumbnail, selectChannelThumbnail } from "../../components/channel-thumbnail";

test("authenticated dashboard shows transcripts before the Manual/Rules playlist manager", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(source, /import \{ TranscriptDashboard \} from "@\/components\/transcript-dashboard";/);
  const authenticatedView = source.slice(source.indexOf('if (!session) {'));
  const transcript = authenticatedView.indexOf("<TranscriptDashboard />");
  const manualTab = authenticatedView.indexOf('setTab("manual")');
  const rulesTab = authenticatedView.indexOf('setTab("rules")');
  assert.ok(transcript >= 0 && transcript < manualTab && manualTab < rulesTab);
  assert.match(authenticatedView, /tab === "manual" \? \(/);
});

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
