import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "@/lib/video-metadata/contracts";
import { createPlaylistsGetHandler } from "./route";

test("playlists route returns list payload on happy path", async () => {
  const handler = createPlaylistsGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      listPlaylists: async () => ({
        playlists: [
          {
            id: "p1",
            title: "Playlist 1",
            description: "Roadtrip videos",
            privacyStatus: "private",
          },
        ],
      }),
    },
  });

  const response = await handler();
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, [
    {
      id: "p1",
      title: "Playlist 1",
      description: "Roadtrip videos",
      privacyStatus: "private",
    },
  ]);
});

test("playlists route maps insufficient auth scope to 403", async () => {
  const handler = createPlaylistsGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      listPlaylists: async () => {
        throw new DomainError({
          code: "AUTH_SCOPE_INSUFFICIENT",
          message: "Reauthorization with the YouTube read scope is required",
          details: { requiredScopes: ["youtube.force-ssl"] },
        });
      },
    },
  });

  const response = await handler();
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.deepEqual(payload, {
    error: "AUTH_SCOPE_INSUFFICIENT",
    message: "Reauthorization with the YouTube read scope is required",
    details: { requiredScopes: ["youtube.force-ssl"] },
  });
});

test("playlists route hides unknown provider failure details", async () => {
  const sensitiveMessage = "provider token abc123 failed for user@example.com";
  const handler = createPlaylistsGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      listPlaylists: async () => {
        throw new Error(sensitiveMessage);
      },
    },
  });

  const response = await handler();
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(payload, {
    error: "internal_error",
    message: "Internal server error",
  });
  assert.equal(JSON.stringify(payload).includes("abc123"), false);
  assert.equal(JSON.stringify(payload).includes("user@example.com"), false);
});

test("playlists route returns unauthorized when session is missing", async () => {
  const handler = createPlaylistsGetHandler({
    getSession: async () => null,
    core: {
      listPlaylists: async () => ({ playlists: [] }),
    },
  });

  const response = await handler();
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(payload, { error: "Unauthorized" });
});
