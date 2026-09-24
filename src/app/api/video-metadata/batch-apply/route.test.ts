import assert from "node:assert/strict";
import test from "node:test";
import { createBatchApplyPostHandler } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/video-metadata/batch-apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("batch apply route forwards the authenticated user", async () => {
  let received: unknown;
  const handler = createBatchApplyPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      executeMetadataBatch: async (input) => {
        received = input;
        return { confirmationId: "a".repeat(64), expectedChannelId: "UC1234567890123456789012", outcomes: [] };
      },
    },
  });

      const item = {
        videoId: "BaBaBaBaBa1",
        proposedTitle: "Title",
        proposedDescription: "Description",
        baseline: {
          snippet: { title: "Original title", description: "Original description", categoryId: "22", defaultLanguage: "es" },
          localizations: { es: { title: "Título original", description: "Descripción original" } },
        },
      };
      const response = await handler(makeRequest({ confirmationId: "a".repeat(64), items: [item], expectedChannelId: "UC1234567890123456789012", confirmed: true }));
  assert.equal(response.status, 200);
  assert.deepEqual(received, {
    confirmationId: "a".repeat(64), items: [item], expectedChannelId: "UC1234567890123456789012", confirmed: true,
    credentialRef: { userId: "user-1" },
  });
});

test("batch apply route rejects unauthenticated requests", async () => {
  const handler = createBatchApplyPostHandler({
    getSession: async () => null,
    core: { executeMetadataBatch: async () => { throw new Error("must not call"); } },
  });
  const response = await handler(makeRequest({}));
  assert.equal(response.status, 401);
});
