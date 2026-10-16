import assert from "node:assert/strict";
import { test } from "node:test";
import { stagingFailureMessage, uploadMessage, uploadPayload, validateUpload } from "./dashboard-upload-form";

const fields = { stagingFile: "clip.mp4", title: "  Short  ", description: "About", expectedChannelId: "UC123" };

test("rejects paths and invalid fields before upload", () => {
  assert.deepEqual(validateUpload(fields), {});
  assert.ok(validateUpload({ ...fields, stagingFile: "../clip.mp4" }).stagingFile);
  assert.ok(validateUpload({ ...fields, stagingFile: "clip.exe" }).stagingFile);
  assert.ok(validateUpload({ ...fields, expectedChannelId: " " }).expectedChannelId);
  assert.ok(validateUpload({ ...fields, title: " " }).title);
  assert.ok(validateUpload({ ...fields, description: "a".repeat(5001) }).description);
});

test("preview and explicit confirmation send only adapter fields", () => {
  assert.deepEqual(uploadPayload(fields, true), { ...fields, title: "Short", dryRun: true, confirmed: false });
  assert.deepEqual(uploadPayload(fields, false), { ...fields, title: "Short", dryRun: false, confirmed: true });
});

test("staging failures only suggest fixing the video for validation errors", () => {
  assert.match(stagingFailureMessage(400), /Check its extension and size/);
  assert.match(stagingFailureMessage(401), /Sign in again/);
  assert.equal(stagingFailureMessage(500), "Video staging is unavailable. Try again later.");
  assert.equal(stagingFailureMessage(503), "Video staging is unavailable. Try again later.");
});

test("uncertain outcomes preserve operation ID and discourage retry", () => {
  assert.match(uploadMessage({ error: "update_failed", outcome: "unknown", operationId: "op-1" }, false), /op-1.*Check your YouTube channel.*Do not retry automatically/);
  assert.match(uploadMessage({ status: "uploaded", videoId: "v", operationId: "op-2" }, false), /Private upload complete.*op-2/);
  assert.match(uploadMessage({ status: "validated", channelId: "UC123" }, true), /No video was uploaded/);
});
