import assert from "node:assert/strict";
import test from "node:test";
import { createVideosGetHandler } from "./route";

function makeDeps(options: {
  record?: () => void;
  list?: () => Promise<{ data: { items: Array<{ id?: string; snippet?: { title?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } }; statistics?: { videoCount?: string } }> } }>;
}) {
  const records: Array<{ operationId: string; operation: string }> = [];
  return {
    records,
    deps: {
      getSession: async () => ({ user: { id: "user-1" } }),
      getYoutube: async () => ({
        channels: {
          list: options.list ?? (async () => ({ data: { items: [{ id: "channel-1" }] } })),
        },
      }),
      createAccountant: () => ({
        record(entry: { operationId: string; operation: string }) {
          records.push(entry);
          options.record?.();
        },
      }),
      operationIdFactory: () => "videos-debug-operation",
      listVideos: async () => ({ videos: [{ videoId: "normal-video" }] }),
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

test("videos debug route preserves provider failures after accounting the attempt", async () => {
  const providerFailure = new Error("provider failure");
  const fixture = makeDeps({ list: async () => { throw providerFailure; } });

  await assert.rejects(
    createVideosGetHandler(fixture.deps)(
      new Request("https://example.test/api/youtube/videos?debug=1"),
    ),
    providerFailure,
  );
  assert.deepEqual(fixture.records, [
    { operationId: "videos-debug-operation", operation: "channels.list" },
  ]);
});

test("videos debug route does not let accounting failure mask the provider result", async () => {
  const providerFailure = new Error("provider failure");
  const fixture = makeDeps({
    record: () => { throw new Error("accounting failure"); },
    list: async () => { throw providerFailure; },
  });

  await assert.rejects(
    createVideosGetHandler(fixture.deps)(
      new Request("https://example.test/api/youtube/videos?debug=1"),
    ),
    providerFailure,
  );
});

test("videos normal route keeps its existing core behavior", async () => {
  const fixture = makeDeps({});
  const response = await createVideosGetHandler(fixture.deps)(
    new Request("https://example.test/api/youtube/videos"),
  );

  assert.deepEqual(await response.json(), [{ videoId: "normal-video" }]);
  assert.deepEqual(fixture.records, []);
});
