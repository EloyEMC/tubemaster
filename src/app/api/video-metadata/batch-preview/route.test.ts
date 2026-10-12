import assert from "node:assert/strict";
import test from "node:test";
import { createBatchPreviewPostHandler } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/video-metadata/batch-preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("batch preview requires a session before processing the body", async () => {
  let called = false;
  const handler = createBatchPreviewPostHandler({
    getSession: async () => null,
    core: { previewMetadataBatch: async () => { called = true; return { items: [] }; } },
  });
  const response = await handler(makeRequest({ videoIds: ["BaBaBaBaBa1"], editorialPrompt: "x" }));
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("batch preview overrides caller credentials with session identity", async () => {
  let received: unknown;
  const handler = createBatchPreviewPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: { previewMetadataBatch: async (input) => { received = input; return { items: [] }; } },
  });
  const response = await handler(makeRequest({
    credentialRef: { userId: "attacker" },
    videoIds: ["BaBaBaBaBa1"],
    editorialPrompt: "Make it clear",
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [] });
  assert.deepEqual(received, {
    credentialRef: { userId: "user-1" },
    videoIds: ["BaBaBaBaBa1"],
    editorialPrompt: "Make it clear",
  });
});
