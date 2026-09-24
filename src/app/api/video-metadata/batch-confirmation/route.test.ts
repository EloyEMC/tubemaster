import assert from "node:assert/strict";
import test from "node:test";
import { createBatchConfirmationPostHandler } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/video-metadata/batch-confirmation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("batch confirmation route forwards the authenticated user and returns the envelope", async () => {
  let received: unknown;
  const handler = createBatchConfirmationPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      confirmMetadataBatch: async (input) => {
        received = input;
            return {
              confirmationId: "a".repeat(64),
              items: [{
                videoId: "BaBaBaBaBa1",
                proposedTitle: "Title",
                proposedDescription: "Description",
                baseline: {
                  snippet: { title: "Original title", description: "Original description", categoryId: "22", defaultLanguage: "es" },
                  localizations: { es: { title: "Título original", description: "Descripción original" } },
                },
              }],
              expectedChannelId: "UC1234567890123456789012",
              confirmed: true,
            };
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
  const response = await handler(
    makeRequest({ items: [item], expectedChannelId: "UC1234567890123456789012", confirmed: true })
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).confirmed, true);
  assert.deepEqual(received, {
    items: [item],
    expectedChannelId: "UC1234567890123456789012",
    confirmed: true,
    credentialRef: { userId: "user-1" },
  });
});

test("batch confirmation route rejects unauthenticated requests", async () => {
  const handler = createBatchConfirmationPostHandler({
    getSession: async () => null,
    core: { confirmMetadataBatch: async () => { throw new Error("must not call"); } },
  });

  const response = await handler(makeRequest({}));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});
