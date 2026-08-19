import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "@/lib/video-metadata/contracts";
import { createRemoveFromPlaylistPostHandler } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/youtube/remove-from-playlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(body: string) {
  return new Request("http://localhost/api/youtube/remove-from-playlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

test("remove-from-playlist route rejects unconfirmed mutations before core calls", async () => {
  let coreCalls = 0;
  const handler = createRemoveFromPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      removeVideosFromPlaylist: async () => {
        coreCalls += 1;
        throw new Error("core should not be called");
      },
    },
  });

  for (const confirmed of [undefined, false]) {
    const response = await handler(
      makeRequest({ playlistId: "p1", videoIds: ["v1"], confirmed }),
    );
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(payload, { error: "Confirmation required" });
  }

  assert.equal(coreCalls, 0);
});

test("remove-from-playlist route forwards the expected channel guard", async () => {
  let coreInput: unknown;
  const handler = createRemoveFromPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      removeVideosFromPlaylist: async (input) => {
        coreInput = input;
        return {
          playlistId: "p1",
          requested: 2,
          removed: 1,
          failures: [{ videoId: "v2", reason: "not-found-in-playlist" }],
        };
      },
    },
  });

  const response = await handler(
    makeRequest({
      playlistId: "p1",
      videoIds: ["v1", "v2"],
      expectedChannelId: "UC_EXPECTED",
      confirmed: true,
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, { removed: 1 });
  assert.deepEqual(coreInput, {
    credentialRef: { userId: "user-1" },
    videoIds: ["v1", "v2"],
    playlistId: "p1",
    expectedChannelId: "UC_EXPECTED",
  });
});

test("remove-from-playlist route rejects missing expected channel before core", async () => {
  let coreCalls = 0;
  const handler = createRemoveFromPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      removeVideosFromPlaylist: async () => {
        coreCalls += 1;
        return {
          playlistId: "p1",
          requested: 0,
          removed: 0,
          failures: [],
        };
      },
    },
  });

  const response = await handler(
    makeRequest({ playlistId: "p1", videoIds: ["v1"], confirmed: true }),
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(payload, { error: "Missing expectedChannelId" });
  assert.equal(coreCalls, 0);
});

test("remove-from-playlist route rejects invalid fields before core with stable errors", async () => {
  let coreCalls = 0;
  const handler = createRemoveFromPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      removeVideosFromPlaylist: async () => {
        coreCalls += 1;
        throw new Error("core should not be called");
      },
    },
  });

  const invalidBodies = [
    {
      body: {
        playlistId: "p1",
        videoIds: "v1",
        expectedChannelId: "UC_EXPECTED",
        confirmed: true,
      },
      error: "Invalid videoIds",
    },
    {
      body: {
        playlistId: 42,
        videoIds: ["v1"],
        expectedChannelId: "UC_EXPECTED",
        confirmed: true,
      },
      error: "Invalid playlistId",
    },
    {
      body: {
        playlistId: "p1",
        videoIds: ["v1"],
        expectedChannelId: 42,
        confirmed: true,
      },
      error: "Invalid expectedChannelId",
    },
    {
      body: {
        playlistId: "p1",
        videoIds: [],
        expectedChannelId: "UC_EXPECTED",
        confirmed: true,
      },
      error: "Invalid videoIds",
    },
    {
      body: {
        playlistId: "p1",
        videoIds: ["v1", "   "],
        expectedChannelId: "UC_EXPECTED",
        confirmed: true,
      },
      error: "Invalid videoIds",
    },
    {
      body: {
        playlistId: "   ",
        videoIds: ["v1"],
        expectedChannelId: "UC_EXPECTED",
        confirmed: true,
      },
      error: "Invalid playlistId",
    },
    {
      body: {
        playlistId: "p1",
        videoIds: ["v1"],
        expectedChannelId: "   ",
        confirmed: true,
      },
      error: "Invalid expectedChannelId",
    },
  ];

  for (const { body, error } of invalidBodies) {
    const response = await handler(makeRequest(body));
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(payload, { error });
  }

  assert.equal(coreCalls, 0);
});

test("remove-from-playlist route bounds malformed JSON before core", async () => {
  let coreCalls = 0;
  const handler = createRemoveFromPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      removeVideosFromPlaylist: async () => {
        coreCalls += 1;
        throw new Error("core should not be called");
      },
    },
  });

  const response = await handler(makeRawRequest("{ malformed"));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(payload, { error: "Invalid JSON body" });
  assert.equal(coreCalls, 0);
});

test("remove-from-playlist route preserves 401 for missing session", async () => {
  const handler = createRemoveFromPlaylistPostHandler({
    getSession: async () => null,
    core: {
      removeVideosFromPlaylist: async () => ({
        playlistId: "unused",
        requested: 0,
        removed: 0,
        failures: [],
      }),
    },
  });

  const response = await handler(
    makeRequest({ playlistId: "p1", videoIds: ["v1"] }),
  );
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(payload, { error: "Unauthorized" });
});

test("remove-from-playlist route maps insufficient auth scope to 403", async () => {
  const handler = createRemoveFromPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      removeVideosFromPlaylist: async () => {
        throw new DomainError({
          code: "AUTH_SCOPE_INSUFFICIENT",
          message: "Reauthorization with the YouTube write scope is required",
          details: { requiredScopes: ["youtube.force-ssl"] },
        });
      },
    },
  });

  const response = await handler(
    makeRequest({
      playlistId: "p1",
      videoIds: ["v1"],
      expectedChannelId: "UC_EXPECTED",
      confirmed: true,
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.deepEqual(payload, {
    error: "AUTH_SCOPE_INSUFFICIENT",
    message: "Reauthorization with the YouTube write scope is required",
    details: { requiredScopes: ["youtube.force-ssl"] },
  });
});

test("remove-from-playlist route maps write channel mismatch to 409 with details", async () => {
  const handler = createRemoveFromPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      removeVideosFromPlaylist: async () => {
        throw new DomainError({
          code: "WRITE_CHANNEL_MISMATCH",
          message: "Playlist does not belong to the active write channel",
          details: {
            expectedChannelId: "UC_EXPECTED",
            activeWriteChannelId: "UC_ACTIVE",
          },
        });
      },
    },
  });

  const response = await handler(
    makeRequest({
      playlistId: "p1",
      videoIds: ["v1"],
      expectedChannelId: "UC_EXPECTED",
      confirmed: true,
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 409);
  assert.deepEqual(payload, {
    error: "WRITE_CHANNEL_MISMATCH",
    message: "Playlist does not belong to the active write channel",
    details: {
      expectedChannelId: "UC_EXPECTED",
      activeWriteChannelId: "UC_ACTIVE",
    },
  });
});

test("remove-from-playlist route hides unknown provider failure details", async () => {
  const handler = createRemoveFromPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      removeVideosFromPlaylist: async () => {
        throw new Error("provider token abc123 failed for user@example.com");
      },
    },
  });

  const response = await handler(
    makeRequest({
      playlistId: "p1",
      videoIds: ["v1"],
      expectedChannelId: "UC_EXPECTED",
      confirmed: true,
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(payload, {
    error: "internal_error",
    message: "Internal server error",
  });
  assert.equal(JSON.stringify(payload).includes("abc123"), false);
  assert.equal(JSON.stringify(payload).includes("user@example.com"), false);
});
