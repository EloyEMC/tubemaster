import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "@/lib/video-metadata/contracts";
import { createCreatePlaylistPostHandler } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/youtube/create-playlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("create-playlist route preserves response envelope", async () => {
  const handler = createCreatePlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      createPlaylist: async () => ({
        playlist: {
          id: "p-created",
          title: "Roadtrip",
          description: "Summer videos",
          privacyStatus: "unlisted",
        },
      }),
    },
  });

  const response = await handler(
    makeRequest({
      title: "Roadtrip",
      description: "Summer videos",
      privacyStatus: "unlisted",
      expectedChannelId: "UC_EXPECTED",
      confirmed: true,
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(payload, {
    id: "p-created",
    title: "Roadtrip",
    description: "Summer videos",
    privacyStatus: "unlisted",
  });
});

test("create-playlist route forwards expected channel and not confirmation", async () => {
  let coreInput: unknown;
  const handler = createCreatePlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      createPlaylist: async (input) => {
        coreInput = input;
        return {
          playlist: {
            id: "p-created",
            title: "Roadtrip",
            description: "Summer videos",
            privacyStatus: "unlisted",
          },
        };
      },
    },
  });

  const response = await handler(
    makeRequest({
      title: "Roadtrip",
      description: "Summer videos",
      privacyStatus: "unlisted",
      expectedChannelId: "UC_EXPECTED",
      confirmed: true,
    }),
  );

  assert.equal(response.status, 201);
  assert.deepEqual(coreInput, {
    credentialRef: { userId: "user-1" },
    title: "Roadtrip",
    description: "Summer videos",
    privacyStatus: "unlisted",
    expectedChannelId: "UC_EXPECTED",
  });
});

test("create-playlist route preserves 401 for missing session", async () => {
  const handler = createCreatePlaylistPostHandler({
    getSession: async () => null,
    core: {
      createPlaylist: async () => ({
        playlist: {
          id: "unused",
          title: "unused",
          description: "",
          privacyStatus: "private",
        },
      }),
    },
  });

  const response = await handler(makeRequest({ title: "Roadtrip" }));
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(payload, { error: "Unauthorized" });
});

test("create-playlist route rejects missing or false confirmation before core calls", async () => {
  let coreCalls = 0;
  const handler = createCreatePlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      createPlaylist: async () => {
        coreCalls += 1;
        throw new Error("core should not be called");
      },
    },
  });

  for (const confirmed of [undefined, false]) {
    const response = await handler(
      makeRequest({
        title: "Roadtrip",
        expectedChannelId: "UC_EXPECTED",
        confirmed,
      }),
    );
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(payload, { error: "Confirmation required" });
  }

  assert.equal(coreCalls, 0);
});

test("create-playlist route rejects missing expected channel before core", async () => {
  let coreCalls = 0;
  const handler = createCreatePlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      createPlaylist: async () => {
        coreCalls += 1;
        throw new Error("core should not be called");
      },
    },
  });

  const response = await handler(
    makeRequest({ title: "Roadtrip", confirmed: true }),
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(payload, { error: "Expected channel ID is required" });
  assert.equal(coreCalls, 0);
});

test("create-playlist route maps insufficient auth scope to 403", async () => {
  const handler = createCreatePlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      createPlaylist: async () => {
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
      title: "Roadtrip",
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

test("create-playlist route maps write channel mismatch to 409", async () => {
  const handler = createCreatePlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      createPlaylist: async () => {
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
      title: "Roadtrip",
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

test("create-playlist route hides unknown provider failure details", async () => {
  const sensitiveMessage = "provider token abc123 failed for user@example.com";
  const handler = createCreatePlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      createPlaylist: async () => {
        throw new Error(sensitiveMessage);
      },
    },
  });

  const response = await handler(
    makeRequest({
      title: "Roadtrip",
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

test("create-playlist route rejects non-string or blank expected channel before core", async () => {
      let coreCalls = 0;
      const handler = createCreatePlaylistPostHandler({
        getSession: async () => ({ user: { id: "user-1" } }),
        core: {
          createPlaylist: async () => {
            coreCalls += 1;
            throw new Error("core should not be called");
          },
        },
      });

      for (const expectedChannelId of [123, "   "]) {
        const response = await handler(
          makeRequest({ title: "Roadtrip", expectedChannelId, confirmed: true }),
        );
        const payload = await response.json();

        assert.equal(response.status, 400);
        assert.deepEqual(payload, { error: "Expected channel ID is required" });
      }

      assert.equal(coreCalls, 0);
    });

    test("create-playlist route rejects non-string title without throwing", async () => {
      let coreCalls = 0;
      const handler = createCreatePlaylistPostHandler({
        getSession: async () => ({ user: { id: "user-1" } }),
        core: {
          createPlaylist: async () => {
            coreCalls += 1;
            throw new Error("core should not be called");
          },
        },
      });

      const response = await handler(
        makeRequest({
          title: 123,
          expectedChannelId: "UC_EXPECTED",
          confirmed: true,
        }),
      );
      const payload = await response.json();

      assert.equal(response.status, 400);
      assert.deepEqual(payload, { error: "Title is required" });
      assert.equal(coreCalls, 0);
    });

    test("create-playlist route rejects missing title", async () => {
  const handler = createCreatePlaylistPostHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      createPlaylist: async () => ({
        playlist: {
          id: "unused",
          title: "unused",
          description: "",
          privacyStatus: "private",
        },
      }),
    },
  });

  const response = await handler(
    makeRequest({
      title: " ",
      expectedChannelId: "UC_EXPECTED",
      confirmed: true,
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(payload, { error: "Title is required" });
});
