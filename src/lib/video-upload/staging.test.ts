import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageVideo } from "./staging";

function request(filename: string, data: string) {
  const form = new FormData();
  form.set("file", new File([data], filename));
  return new Request("http://localhost/stage", { method: "POST", body: form });
}

test("stages a bounded video with an opaque server-generated reference", async () => {
  const root = await mkdtemp(join(tmpdir(), "stage-test-"));
  const result = await stageVideo(request("personal-name.mp4", "video"), root, 100);
  assert.match(result.stagingFile, /^[a-f0-9-]{36}\.mp4$/);
  assert.equal(result.filename, "personal-name.mp4");
  assert.equal(result.size, 5);
  assert.equal((await readFile(join(root, result.stagingFile))).toString(), "video");
});

test("rejects unsupported, oversized, empty, and malformed input without retained file", async () => {
  const root = await mkdtemp(join(tmpdir(), "stage-test-"));
  for (const [name, body] of [["bad.exe", "ok"], ["large.mov", "123456"], ["empty.mkv", ""]]) {
    await assert.rejects(stageVideo(request(name, body), root, 5), /validation_failed/);
  }
  await assert.rejects(stageVideo(new Request("http://localhost/stage", { method: "POST", body: "invalid" }), root, 5), /validation_failed/);
  assert.deepEqual(await readdir(root), []);
});
