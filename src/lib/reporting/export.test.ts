import assert from "node:assert/strict";
import test from "node:test";
import {
  EmptySelectionError,
  exportVideos,
  parseExportRequest,
  selectVideos,
  type ExportVideo,
} from "./export";

const videos: ExportVideo[] = [
  {
    videoId: "video-1",
    title: 'A "quoted", title',
    description: "First line\nSecond line",
    publishedAt: "2026-01-02T03:04:05Z",
  },
];

test("exports selected videos as stable JSON fields", () => {
  const videoWithExtraField = { ...videos[0], extraField: "must not be exported" };
  const result = exportVideos([videoWithExtraField], "json");

  assert.equal(result.contentType, "application/json");
  assert.equal(result.filename, "videos-export.json");
  assert.equal(
    result.body,
    '[{"videoId":"video-1","title":"A \\\"quoted\\\", title","description":"First line\\nSecond line","publishedAt":"2026-01-02T03:04:05Z"}]'
  );
});

test("exports selected videos as escaped CSV with stable header", () => {
  const result = exportVideos(videos, "csv");

  assert.equal(result.contentType, "text/csv; charset=utf-8");
  assert.equal(result.filename, "videos-export.csv");
  assert.equal(
    result.body,
    'videoId,title,description,publishedAt\nvideo-1,"A ""quoted"", title","First line\nSecond line",2026-01-02T03:04:05Z\n'
  );
});

test("rejects an empty selection with a typed error", () => {
  assert.throws(
    () => exportVideos([], "json"),
    (error: unknown) => error instanceof EmptySelectionError && error.code === "empty_selection"
  );
});

    test("parses selected ids, title filter, and format from the request", () => {
      const request = new Request(
        "http://localhost/api/reporting/videos?videoIds=video-1,video-2&videoIds=video-3&title=quoted&format=csv"
      );

      assert.deepEqual(parseExportRequest(request), {
        videoIds: ["video-1", "video-2", "video-3"],
        title: "quoted",
        format: "csv",
      });
    });

    test("filters selected videos by title before export", () => {
      assert.deepEqual(
        selectVideos(
          [
            videos[0],
            {
              videoId: "video-2",
              title: "Another video",
              description: "Description",
              publishedAt: "2026-01-03T03:04:05Z",
            },
          ],
          ["video-1", "video-2"],
          "QUOTED"
        ),
        [videos[0]]
      );
    });

test("rejects requests without selected ids", () => {
  assert.throws(
    () => parseExportRequest(new Request("http://localhost/api/reporting/videos")),
    (error: unknown) => error instanceof EmptySelectionError && error.code === "empty_selection"
  );
});
