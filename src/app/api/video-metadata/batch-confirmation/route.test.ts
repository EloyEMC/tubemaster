import assert from "node:assert/strict";
import test from "node:test";
import { createBatchConfirmationPostHandler } from "./route";
import { createVideoMetadataServices } from "@/lib/video-metadata/services";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/video-metadata/batch-confirmation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const payload = {
  items: [{ videoId: "BaBaBaBaBa1", proposedTitle: "Title", proposedDescription: "Description" }],
  expectedChannelId: "UC1234567890123456789012",
  confirmed: true as const,
};

test("batch confirmation route binds the session and returns the envelope", async () => {
  let received: unknown;
  const handler = createBatchConfirmationPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      confirmMetadataBatch: async (input) => {
        received = input;
        return { ...payload, confirmationId: "a".repeat(64) };
      },
    },
  });
  const response = await handler(makeRequest({ ...payload, credentialRef: { userId: "attacker" } }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).confirmationId, "a".repeat(64));
  assert.deepEqual(received, { ...payload, credentialRef: { userId: "user-1" } });
});

test("batch confirmation route rejects unauthenticated requests before calling core", async () => {
  const handler = createBatchConfirmationPostHandler({
    getSession: async () => null,
    core: { confirmMetadataBatch: async () => { throw new Error("must not call"); } },
  });
  const response = await handler(makeRequest(payload));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("batch confirmation route maps invalid JSON and validation failures", async () => {
  const handler = createBatchConfirmationPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: { confirmMetadataBatch: createVideoMetadataServices({} as never).confirmMetadataBatch },
  });
  const invalid = await handler(makeRequest({ ...payload, confirmed: false }));
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, "validation_failed");
  const malformed = await handler(new Request("http://localhost/api/video-metadata/batch-confirmation", {
    method: "POST", body: "{", headers: { "content-type": "application/json" },
  }));
  assert.equal(malformed.status, 400);
});
