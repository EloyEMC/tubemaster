import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "@/lib/video-metadata/contracts";
import { createChannelInfoGetHandler } from "./route";

const channel = {
  id: "channel-1",
  snippet: { title: "Channel", thumbnails: { default: { url: "thumb" } } },
  statistics: { videoCount: "3" },
};

function makeDeps(options: {
  session?: { user?: { id?: string | null } } | null;
  list?: () => Promise<{ data: { items?: (typeof channel)[] } }>;
}) {
  return {
    getSession: async () =>
      options.session === undefined
        ? { user: { id: "user-1" } }
        : options.session,
    getYoutube: async () => ({
      channels: {
        list: options.list ?? (async () => ({ data: { items: [channel] } })),
      },
    }),
    createAccountant: () => ({ record: () => undefined }),
    operationIdFactory: () => "channel-info-operation",
  } as unknown as Parameters<typeof createChannelInfoGetHandler>[0];
}

test("channel info returns unauthorized when session is missing", async () => {
  const response = await createChannelInfoGetHandler(
    makeDeps({ session: null }),
  )();

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("channel info preserves an empty channel result", async () => {
  const response = await createChannelInfoGetHandler(
    makeDeps({ list: async () => ({ data: { items: [] } }) }),
  )();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { channel: null });
});

test("channel info maps domain errors to stable responses", async () => {
  const response = await createChannelInfoGetHandler(
    makeDeps({
      list: async () => {
        throw new DomainError({
          code: "AUTH_SCOPE_INSUFFICIENT",
          message: "YouTube read scope is required",
          details: { requiredScopes: ["youtube.readonly"] },
        });
      },
    }),
  )();

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "AUTH_SCOPE_INSUFFICIENT",
    message: "YouTube read scope is required",
    details: { requiredScopes: ["youtube.readonly"] },
  });
});

test("channel info sanitizes unknown provider failures", async () => {
  const response = await createChannelInfoGetHandler(
    makeDeps({
      list: async () => {
        throw new Error("provider token secret-token for user@example.com");
      },
    }),
  )();

  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.deepEqual(payload, {
    error: "internal_error",
    message: "Internal server error",
  });
  assert.equal(JSON.stringify(payload).includes("secret-token"), false);
  assert.equal(JSON.stringify(payload).includes("user@example.com"), false);
});
