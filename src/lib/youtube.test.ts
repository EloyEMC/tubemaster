import assert from "node:assert/strict";
import test from "node:test";
import { getVideoById, listVideosByChannel } from "./youtube";
import { InMemoryQuotaAccountant } from "./quota/accountant";

function makeYoutube(responses: {
  channel?: unknown;
  playlistPages?: unknown[];
  video?: unknown;
  failure?: Error;
}) {
  let page = 0;
  return {
    channels: {
      list: async () => {
        if (responses.failure) throw responses.failure;
        return responses.channel ?? { data: { items: [{ contentDetails: { relatedPlaylists: { uploads: "uploads-1" } } }] } };
      },
    },
    playlistItems: {
      list: async () => {
        if (responses.failure) throw responses.failure;
        return responses.playlistPages?.[page++] ?? { data: { items: [] } };
      },
    },
    videos: {
      list: async () => {
        if (responses.failure) throw responses.failure;
        return responses.video ?? { data: { items: [] } };
      },
    },
  } as never;
}

test("getVideoById accounts the attempted videos.list request", async () => {
  const accountant = new InMemoryQuotaAccountant();
  const result = await getVideoById(
    makeYoutube({
      video: { data: { items: [{ id: "video-1", snippet: { title: "Title" } }] } },
    }),
    "video-1",
    { operationId: "preview-operation", quotaAccountant: accountant },
  );

  assert.equal(result?.videoId, "video-1");
  assert.deepEqual(
    accountant.entries().map(({ operationId, operation }) => [operationId, operation]),
    [["preview-operation", "videos.list"]],
  );
});

test("listVideosByChannel accounts channels.list and every playlist page", async () => {
  const accountant = new InMemoryQuotaAccountant();
  const result = await listVideosByChannel({
    youtube: makeYoutube({
      playlistPages: [
        { data: { items: [{ snippet: { resourceId: { videoId: "video-1" } } }], nextPageToken: "next" } },
        { data: { items: [{ snippet: { resourceId: { videoId: "video-2" } } }] } },
      ],
    }),
    channelId: "channel-1",
    operationId: "list-operation",
    quotaAccountant: accountant,
  });

  assert.equal(result.length, 2);
  assert.deepEqual(
    accountant.entries().map(({ operationId, operation }) => [operationId, operation]),
    [
      ["list-operation", "channels.list"],
      ["list-operation", "playlistItems.list"],
      ["list-operation", "playlistItems.list"],
    ],
  );
});

test("listVideos accounts a failed channels.list attempt", async () => {
  const accountant = new InMemoryQuotaAccountant();
  await assert.rejects(
    () =>
      listVideosByChannel({
        youtube: makeYoutube({ failure: new Error("provider failure") }),
        channelId: "channel-1",
        operationId: "failed-list-operation",
        quotaAccountant: accountant,
      }),
    /provider failure/,
  );

  assert.deepEqual(
    accountant.entries().map(({ operationId, operation }) => [operationId, operation]),
    [["failed-list-operation", "channels.list"]],
  );
});

test("metadata quota accounting failures do not mask provider failures", async () => {
  const providerFailure = new Error("provider failure");
  await assert.rejects(
    () =>
      getVideoById(
        makeYoutube({ failure: providerFailure }),
        "video-1",
        { operationId: "failed-operation", quotaAccountant: { record: () => { throw new Error("accounting failure"); } } },
      ),
    providerFailure,
  );
});
