import assert from "node:assert/strict";
import { test } from "node:test";
import { createStagePostHandler } from "./route";
import { StageError } from "@/lib/video-upload/staging";

const request = () => new Request("http://localhost/api/youtube/upload/stage", { method: "POST" });

test("requires authentication before touching multipart content", async () => {
  let called = false;
  const post = createStagePostHandler({ getSession: async () => null, stage: async () => { called = true; throw Error("secret"); } });
  const reply = await post(request());
  assert.equal(reply.status, 401);
  assert.deepEqual(await reply.json(), { error: "unauthorized" });
  assert.equal(called, false);
});

test("returns opaque staging metadata", async () => {
  const getSession = async () => ({ user: { id: "user" } });
  const success = createStagePostHandler({ getSession, stage: async () => ({ stagingFile: "random.mp4", filename: "clip.mp4", size: 4 }) });
  assert.deepEqual(await (await success(request())).json(), { stagingFile: "random.mp4", filename: "clip.mp4", size: 4 });
});

test("expected staging validation errors return 400 without exposing details", async () => {
  const post = createStagePostHandler({ getSession: async () => ({ user: { id: "user" } }), stage: async () => { throw new StageError("private validation detail"); } });
  const reply = await post(request());
  assert.equal(reply.status, 400);
  assert.deepEqual(await reply.json(), { error: "validation_failed" });
});

test("unexpected session and staging failures return safe 500 responses", async () => {
  const secret = "/secret/path";
  const sessionFailure = createStagePostHandler({ getSession: async () => { throw Error(secret); }, stage: async () => { throw Error("should not stage"); } });
  const stageFailure = createStagePostHandler({ getSession: async () => ({ user: { id: "user" } }), stage: async () => { throw Error(secret); } });
  for (const post of [sessionFailure, stageFailure]) {
    const reply = await post(request());
    assert.equal(reply.status, 500);
    assert.deepEqual(await reply.json(), { error: "staging_failed" });
  }
});
