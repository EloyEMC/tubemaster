import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StageError, stageVideo } from "./staging";

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
    await assert.rejects(stageVideo(request(name, body), root, 5), StageError);
  }
  await assert.rejects(stageVideo(new Request("http://localhost/stage", { method: "POST", body: "invalid" }), root, 5), /validation_failed/);
  assert.deepEqual(await readdir(root), []);
});

test("filesystem failures retain their original type", async () => {
  const root = await mkdtemp(join(tmpdir(), "stage-test-"));
  const occupied = join(root, "occupied");
  await writeFile(occupied, "not a directory");
  await assert.rejects(stageVideo(request("clip.mp4", "video"), occupied, 100), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as NodeJS.ErrnoException).code, "EEXIST");
    assert.ok(!(error instanceof StageError));
    return true;
  });
  assert.deepEqual(await readdir(root), ["occupied"]);
});

test("stream failures after opening a staged file clean up and remain unexpected", async () => {
  const root = await mkdtemp(join(tmpdir(), "stage-test-"));
  const form = request("clip.mp4", "video");
  const bytes = new Uint8Array(await form.arrayBuffer());
  const position = new TextDecoder().decode(bytes).indexOf("video");
  assert.ok(position > 0);
  const failure = new Error("stream failed");
  let first = true;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (first) { first = false; controller.enqueue(bytes.slice(0, position + 2)); }
      else controller.error(failure);
    },
  });
  const broken = new Request("http://localhost/stage", { method: "POST", headers: form.headers, body, duplex: "half" } as RequestInit & { duplex: "half" });
  await assert.rejects(stageVideo(broken, root, 100), (error: unknown) => error === failure);
  assert.deepEqual(await readdir(root), []);
});
