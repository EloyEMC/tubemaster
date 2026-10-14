import assert from "node:assert/strict";
import { test } from "node:test";
import { createStagePostHandler } from "./route";

const request = () => new Request("http://localhost/api/youtube/upload/stage", { method: "POST" });

test("requires authentication before touching multipart content", async () => {
  let called = false;
  const post = createStagePostHandler({ getSession: async () => null, stage: async () => { called = true; throw Error("secret"); } });
  const reply = await post(request());
  assert.equal(reply.status, 401);
  assert.deepEqual(await reply.json(), { error: "unauthorized" });
  assert.equal(called, false);
});

test("returns opaque staging metadata and hides failures", async () => {
  const getSession = async () => ({ user: { id: "user" } });
  const success = createStagePostHandler({ getSession, stage: async () => ({ stagingFile: "random.mp4", filename: "clip.mp4", size: 4 }) });
  assert.deepEqual(await (await success(request())).json(), { stagingFile: "random.mp4", filename: "clip.mp4", size: 4 });
  const failure = createStagePostHandler({ getSession, stage: async () => { throw Error("/secret/path"); } });
  const response = await failure(request());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "validation_failed" });
});
