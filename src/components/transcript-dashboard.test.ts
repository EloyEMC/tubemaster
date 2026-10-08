import assert from "node:assert/strict";
import test from "node:test";
import { transcriptDisplayText } from "./transcript-dashboard";

test("transcript dashboard maps acquisition states to display text", () => {
  assert.equal(transcriptDisplayText({ status: "available", text: "captions", language: "en" }, null, false), "Available · en");
  assert.equal(transcriptDisplayText({ status: "available", text: "captions" }, null, false), "Available");
  assert.equal(transcriptDisplayText({ status: "unavailable", reason: "no-captions" }, null, false), "No captions are available for this video.");
  assert.equal(transcriptDisplayText({ status: "unavailable", reason: "captions-not-downloadable" }, null, false), "The transcript is currently unavailable.");
  assert.equal(transcriptDisplayText({ status: "unsupported", reason: "provider-missing" }, null, false), "This transcript provider is unsupported.");
  assert.equal(transcriptDisplayText(null, "Sign in to use the transcript dashboard.", false), "Sign in to use the transcript dashboard.");
  assert.equal(transcriptDisplayText(null, "Unable to load transcript.", false), "Unable to load transcript.");
  assert.equal(transcriptDisplayText(null, null, true), "Loading transcript...");
  assert.equal(transcriptDisplayText(null, null, false), null);
});
