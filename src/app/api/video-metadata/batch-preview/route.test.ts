import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "@/lib/video-metadata/contracts";
import { createBatchPreviewPostHandler } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/video-metadata/batch-preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("batch preview route forwards session credential and returns items", async () => {
  let received: unknown;
  const handler = createBatchPreviewPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      previewMetadataBatch: async (input) => {
        received = input;
        return { items: [] };
      },
    },
  });

  const response = await handler(
    makeRequest({ videoIds: ["BaBaBaBaBa1"], editorialPrompt: "Make it clear" })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [] });
  assert.deepEqual(received, {
    videoIds: ["BaBaBaBaBa1"],
    editorialPrompt: "Make it clear",
    credentialRef: { userId: "user-1" },
  });
});

test("batch preview route requires an authenticated session", async () => {
  const handler = createBatchPreviewPostHandler({
    getSession: async () => null,
    core: { previewMetadataBatch: async () => ({ items: [] }) },
  });

  const response = await handler(makeRequest({ videoIds: ["BaBaBaBaBa1"], editorialPrompt: "x" }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("batch preview route maps validation errors to 400", async () => {
  const handler = createBatchPreviewPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      previewMetadataBatch: async () => {
        throw new DomainError({ code: "validation_failed", message: "Invalid batch preview input" });
      },
    },
  });

  const response = await handler(makeRequest({ videoIds: [], editorialPrompt: "x" }));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error, "validation_failed");
  assert.equal(payload.message, "Invalid batch preview input");
});
