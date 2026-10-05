import assert from "node:assert/strict";
import test from "node:test";
import { DomainError, type DomainErrorCode } from "@/lib/video-metadata/contracts";
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

for (const [code, status] of [
  ["validation_failed", 400],
  ["not_found", 404],
  ["AUTH_SCOPE_INSUFFICIENT", 403],
  ["unauthorized", 401],
] as const satisfies ReadonlyArray<readonly [DomainErrorCode, number]>) {
  test(`playlists route maps ${code} to ${status}`, async () => {
    const handler = createPlaylistsGetHandler({
      getSession: async () => ({ user: { id: "user-1" } }),
      core: {
        listPlaylists: async () => {
          throw new DomainError({ code, message: "Provider rejected request", details: { reason: "typed" } });
        },
      },
    });

    const response = await handler();
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), {
      error: code,
      message: "Provider rejected request",
      details: { reason: "typed" },
    });
  });
}

test("playlists route sanitizes unexpected failures", async () => {
  const handler = createPlaylistsGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      listPlaylists: async () => {
        throw new Error("secret provider token and request details");
      },
    },
  });

  const response = await handler();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "internal_error",
    message: "Internal server error",
  });
});
