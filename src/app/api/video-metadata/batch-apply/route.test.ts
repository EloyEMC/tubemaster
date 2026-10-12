import assert from "node:assert/strict";
import test from "node:test";
import { createBatchApplyPostHandler } from "./route";
import { DomainError } from "@/lib/video-metadata/contracts";

const payload = {
  confirmationId: "a".repeat(64),
  expectedChannelId: "UC1234567890123456789012",
  confirmed: true,
  items: [{ videoId: "BaBaBaBaBa1", proposedTitle: "New", proposedDescription: "After", baseline: { title: "Old", description: "Before", localizations: {} } }],
};
function request(body: unknown) {
  return new Request("http://localhost/api/video-metadata/batch-apply", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

test("batch apply binds the authenticated user and returns outcomes", async () => {
  let received: unknown;
  const outcomes = [{ videoId: payload.items[0].videoId, status: "success" as const }];
  const handler = createBatchApplyPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: { executeMetadataBatch: async (input) => {
      received = input;
      return { confirmationId: payload.confirmationId, expectedChannelId: payload.expectedChannelId, outcomes };
    } },
  });
  const response = await handler(request({ ...payload, credentialRef: { userId: "attacker" } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { confirmationId: payload.confirmationId, expectedChannelId: payload.expectedChannelId, outcomes });
  assert.deepEqual(received, { ...payload, credentialRef: { userId: "user-1" } });
});

test("batch apply rejects missing session before invoking core", async () => {
  const handler = createBatchApplyPostHandler({
    getSession: async () => null,
    core: { executeMetadataBatch: async () => { throw Error("must not call"); } },
  });
  const response = await handler(request(payload));
  assert.equal(response.status, 401);
});

test("batch apply maps validation errors", async () => {
  const handler = createBatchApplyPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: { executeMetadataBatch: async () => { throw new DomainError({ code: "validation_failed", message: "Stale" }); } },
  });
  const response = await handler(request(payload));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "validation_failed");
});
