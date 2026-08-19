import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "@/lib/video-metadata/contracts";
import { createAddToPlaylistPostHandler } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/youtube/add-to-playlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
body: JSON.stringify(body),
  });
}

function makeRawRequest(body: string) {
  return new Request("http://localhost/api/youtube/add-to-playlist", {
method: "POST",
headers: { "content-type": "application/json" },
body,
  });
}

test("add-to-playlist route rejects unconfirmed mutations before core calls", async () => {
  let coreCalls = 0;
  const handler = createAddToPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      addVideosToPlaylist: async () => {
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

test("add-to-playlist route forwards the expected channel guard", async () => {
  let coreInput: unknown;
  const handler = createAddToPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      addVideosToPlaylist: async (input) => {
        coreInput = input;
        return {
          playlistId: "p1",
          attempted: 2,
          added: 1,
          failures: [{ videoId: "v2", reason: "already-present" }],
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
  assert.deepEqual(payload, { added: 1 });
  assert.deepEqual(coreInput, {
    credentialRef: { userId: "user-1" },
    videoIds: ["v1", "v2"],
    playlistId: "p1",
    expectedChannelId: "UC_EXPECTED",
  });
});

test("add-to-playlist route rejects missing expected channel before core", async () => {
  let coreCalls = 0;
  const handler = createAddToPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      addVideosToPlaylist: async () => {
        coreCalls += 1;
        return {
          playlistId: "p1",
          attempted: 0,
          added: 0,
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

test("add-to-playlist route rejects invalid field types before core", async () => {
  let coreCalls = 0;
  const handler = createAddToPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      addVideosToPlaylist: async () => {
        coreCalls += 1;
        throw new Error("core should not be called");
      },
    },
  });

  const invalidBodies = [
    { playlistId: "p1", videoIds: "v1", expectedChannelId: "UC_EXPECTED", confirmed: true },
    { playlistId: 42, videoIds: ["v1"], expectedChannelId: "UC_EXPECTED", confirmed: true },
    { playlistId: "p1", videoIds: ["v1"], expectedChannelId: 42, confirmed: true },
    { playlistId: "p1", videoIds: [""], expectedChannelId: "UC_EXPECTED", confirmed: true },
    { playlistId: "p1", videoIds: ["v1", 42], expectedChannelId: "UC_EXPECTED", confirmed: true },
    { playlistId: "   ", videoIds: ["v1"], expectedChannelId: "UC_EXPECTED", confirmed: true },
    { playlistId: "p1", videoIds: ["v1"], expectedChannelId: "   ", confirmed: true },
    { playlistId: "p1", videoIds: ["   "], expectedChannelId: "UC_EXPECTED", confirmed: true },
  ];

  for (const body of invalidBodies) {
    const response = await handler(makeRequest(body));
    assert.equal(response.status, 400);
  }

  assert.equal(coreCalls, 0);
});

test("add-to-playlist route bounds malformed JSON before core", async () => {
  let coreCalls = 0;
  const handler = createAddToPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      addVideosToPlaylist: async () => {
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

test("add-to-playlist route preserves 401 for missing session", async () => {
  const handler = createAddToPlaylistPostHandler({
    getSession: async () => null,
    core: {
      addVideosToPlaylist: async () => ({
        playlistId: "unused",
        attempted: 0,
        added: 0,
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

test("add-to-playlist route maps insufficient auth scope to 403", async () => {
  const handler = createAddToPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      addVideosToPlaylist: async () => {
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

test("add-to-playlist route maps write channel mismatch to 409 with details", async () => {
  const handler = createAddToPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      addVideosToPlaylist: async () => {
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

test("add-to-playlist route hides unknown provider failure details", async () => {
  const handler = createAddToPlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      addVideosToPlaylist: async () => {
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
