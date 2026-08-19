import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "@/lib/video-metadata/contracts";
import { createVideosGetHandler } from "./route";

function makeDeps(options: {
  record?: () => void;
  list?: () => Promise<{
    data: {
      items: Array<{
        id?: string;
        snippet?: { title?: string };
        contentDetails?: { relatedPlaylists?: { uploads?: string } };
        statistics?: { videoCount?: string };
      }>;
    };
  }>;
  listVideos?: () => Promise<{ videos: Array<{ videoId: string }> }>;
}) {
  const records: Array<{ operationId: string; operation: string }> = [];
  return {
    records,
    deps: {
      getSession: async () => ({ user: { id: "user-1" } }),
      getYoutube: async () => ({
        channels: {
          list:
            options.list ??
            (async () => ({ data: { items: [{ id: "channel-1" }] } })),
        },
      }),
      createAccountant: () => ({
        record(entry: { operationId: string; operation: string }) {
          records.push(entry);
          options.record?.();
        },
      }),
      operationIdFactory: () => "videos-debug-operation",
      listVideos:
        options.listVideos ??
        (async () => ({ videos: [{ videoId: "normal-video" }] })),
    } as unknown as Parameters<typeof createVideosGetHandler>[0],
  };
}

test("videos debug route accounts its channels.list request", async () => {
  const fixture = makeDeps({});
  const response = await createVideosGetHandler(fixture.deps)(
    new Request("https://example.test/api/youtube/videos?debug=1"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { channels: [{ id: "channel-1" }] });
  assert.deepEqual(fixture.records, [
    { operationId: "videos-debug-operation", operation: "channels.list" },
  ]);
});

test("videos debug route maps domain errors after accounting the attempt", async () => {
  const fixture = makeDeps({
    list: async () => {
      throw new DomainError({
        code: "AUTH_SCOPE_INSUFFICIENT",
        message: "YouTube read scope is required",
        details: { requiredScopes: ["youtube.readonly"] },
      });
    },
  });

  const response = await createVideosGetHandler(fixture.deps)(
    new Request("https://example.test/api/youtube/videos?debug=1"),
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "AUTH_SCOPE_INSUFFICIENT",
    message: "YouTube read scope is required",
    details: { requiredScopes: ["youtube.readonly"] },
  });
  assert.deepEqual(fixture.records, [
    { operationId: "videos-debug-operation", operation: "channels.list" },
  ]);
});

test("videos debug route sanitizes unknown provider failures after accounting the attempt", async () => {
  const fixture = makeDeps({
    list: async () => {
      throw new Error("provider token secret-token for user@example.com");
    },
  });

  const response = await createVideosGetHandler(fixture.deps)(
    new Request("https://example.test/api/youtube/videos?debug=1"),
  );
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "internal_error",
    message: "Internal server error",
  });
  assert.deepEqual(fixture.records, [
    { operationId: "videos-debug-operation", operation: "channels.list" },
  ]);
});

test("videos debug route does not let accounting failure mask the sanitized provider result", async () => {
  const fixture = makeDeps({
    record: () => {
      throw new Error("accounting failure");
    },
    list: async () => {
      throw new Error("provider token secret-token");
    },
  });

  const response = await createVideosGetHandler(fixture.deps)(
    new Request("https://example.test/api/youtube/videos?debug=1"),
  );
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: "internal_error",
    message: "Internal server error",
  });
});

test("videos normal route maps domain errors to stable responses", async () => {
  const fixture = makeDeps({
    listVideos: async () => {
      throw new DomainError({
        code: "AUTH_SCOPE_INSUFFICIENT",
        message: "YouTube read scope is required",
        details: { requiredScopes: ["youtube.readonly"] },
      });
    },
  });

  const response = await createVideosGetHandler(fixture.deps)(
    new Request("https://example.test/api/youtube/videos"),
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "AUTH_SCOPE_INSUFFICIENT",
    message: "YouTube read scope is required",
    details: { requiredScopes: ["youtube.readonly"] },
  });
});

test("videos normal route sanitizes unknown service failures", async () => {
  const fixture = makeDeps({
    listVideos: async () => {
      throw new Error("database secret-token for user@example.com");
    },
  });

  const response = await createVideosGetHandler(fixture.deps)(
    new Request("https://example.test/api/youtube/videos"),
  );
  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.deepEqual(payload, {
    error: "internal_error",
    message: "Internal server error",
  });
  assert.equal(JSON.stringify(payload).includes("secret-token"), false);
  assert.equal(JSON.stringify(payload).includes("user@example.com"), false);
});

test("videos normal route keeps its existing core behavior", async () => {
  const fixture = makeDeps({});
  const response = await createVideosGetHandler(fixture.deps)(
    new Request("https://example.test/api/youtube/videos"),
  );

  assert.deepEqual(await response.json(), [{ videoId: "normal-video" }]);
  assert.deepEqual(fixture.records, []);
});
