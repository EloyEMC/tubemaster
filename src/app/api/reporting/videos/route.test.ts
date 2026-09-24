import assert from "node:assert/strict";
import test from "node:test";
import { createReportingVideosGetHandler } from "./route";

test("reporting route returns an authenticated CSV download", async () => {
  const handler = createReportingVideosGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      listVideos: async () => ({
        videos: [
          {
            videoId: "video-1",
            title: "Selected video",
            description: "Description",
            publishedAt: "2026-01-02T03:04:05Z",
          },
        ],
      }),
    },
  });

  const response = await handler(
    new Request("http://localhost/api/reporting/videos?videoIds=video-1&format=csv")
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="videos-export.csv"'
  );
  assert.equal(
    await response.text(),
    "videoId,title,description,publishedAt\nvideo-1,Selected video,Description,2026-01-02T03:04:05Z\n"
  );
});

test("reporting route applies the title filter before export", async () => {
  const handler = createReportingVideosGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: {
      listVideos: async () => ({
        videos: [
          {
            videoId: "video-1",
            title: "Selected video",
            description: "Description",
            publishedAt: "2026-01-02T03:04:05Z",
          },
          {
            videoId: "video-2",
            title: "Other video",
            description: "Other description",
            publishedAt: "2026-01-03T03:04:05Z",
          },
        ],
      }),
    },
  });

  const response = await handler(
    new Request(
      "http://localhost/api/reporting/videos?videoIds=video-1,video-2&title=SELECTED&format=csv"
    )
  );

  assert.equal(
    await response.text(),
    "videoId,title,description,publishedAt\nvideo-1,Selected video,Description,2026-01-02T03:04:05Z\n"
  );
});

test("reporting route returns 422 for an empty selection", async () => {
  const handler = createReportingVideosGetHandler({
    getSession: async () => ({ user: { id: "user-1" } }),
    core: { listVideos: async () => ({ videos: [] }) },
  });

  const response = await handler(
    new Request("http://localhost/api/reporting/videos?format=json")
  );

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    error: "empty_selection",
    message: "At least one video must be selected",
  });
});

test("reporting route rejects unauthenticated requests", async () => {
  const handler = createReportingVideosGetHandler({
    getSession: async () => null,
    core: { listVideos: async () => ({ videos: [] }) },
  });

  const response = await handler(
    new Request("http://localhost/api/reporting/videos?videoIds=video-1")
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});
