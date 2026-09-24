import assert from "node:assert/strict";
import test from "node:test";
import type { PlaylistManagementCore } from "@/lib/playlist-management";
import type { VideoMetadataCore } from "@/lib/video-metadata";
import type {
  QuotaUsageSummary,
  QuotaUsageSummaryFilter,
} from "@/lib/quota/repository";
import { createMcpToolHandlers } from "./server";

function makeCoreStub(): Pick<
  VideoMetadataCore & PlaylistManagementCore,
  | "listVideos"
  | "getTranscript"
  | "previewMetadata"
  | "applyMetadata"
  | "listPlaylists"
  | "createPlaylist"
  | "updatePlaylist"
  | "deletePlaylist"
  | "addVideosToPlaylist"
  | "removeVideosFromPlaylist"
> {
  return {
    listVideos: async () => ({ videos: [] }),
    getTranscript: async () => ({
      transcript: { status: "available" as const, text: "Transcript" },
    }),
    previewMetadata: async () => ({
      video: {
        videoId: "v1",
        title: "Video",
        description: "Description",
        publishedAt: "2024-01-01",
      },
      transcript: { status: "available" as const, text: "Transcript" },
      draft: {
        finalTitle: "Title",
        description: "Description",
        promptVersion: "test",
      },
    }),
    applyMetadata: async () => ({
      dryRun: true,
      videoId: "v1",
      targetLanguage: "en",
      languageSource: "defaultLanguage" as const,
      snippet: { before: {}, proposed: {} },
      localizations: { before: {}, proposed: {}, affected: [] },
    }),
    listPlaylists: async () => ({ playlists: [] }),
    createPlaylist: async () => ({
      playlist: {
        id: "p1",
        title: "Playlist",
        description: "Description",
        privacyStatus: "private" as const,
      },
    }),
    updatePlaylist: async () => ({
      playlist: {
        id: "p1",
        title: "Playlist",
        description: "Description",
        privacyStatus: "private" as const,
      },
    }),
    deletePlaylist: async () => ({ deleted: true, playlistId: "p1" }),
    addVideosToPlaylist: async () => ({
      playlistId: "p1",
      attempted: 0,
      added: 0,
      failures: [],
    }),
    removeVideosFromPlaylist: async () => ({
      playlistId: "p1",
      requested: 0,
      removed: 0,
      failures: [],
    }),
  };
}

function makeAuthStub(overrides: { whoami?: () => Promise<unknown> } = {}) {
  return {
    whoami:
      overrides.whoami ??
      (async () => ({
        userId: "active-user",
        email: "active@example.com",
        accessToken: "must-not-be-exposed",
      })),
    resolveEffectiveCredentialRef: async () => ({ userId: "active-user" }),
    selectUser: async () => ({}),
    listKnownWriteChannels: async () => ({}),
    selectWriteChannel: async () => ({}),
  };
}

function makeReader(
  summarizeQuotaUsage: (
    filter: QuotaUsageSummaryFilter,
  ) => Promise<QuotaUsageSummary[]>,
) {
  return { summarizeQuotaUsage };
}

test("MCP quota_usage scopes summaries to the authenticated active user", async () => {
  let capturedFilter: QuotaUsageSummaryFilter | undefined;
  const summaries = [
    {
      bucketStart: "2025-01-01T00:00:00.000Z",
      scopeType: "user",
      scopeId: "active-user",
      operation: "transcript",
      operationId: "operation-1",
      operationCount: 2,
      estimatedUnits: 200,
    },
  ];
  const handlers = createMcpToolHandlers(
    makeCoreStub(),
    makeAuthStub(),
    makeReader(async (filter) => {
      capturedFilter = filter;
      return summaries;
    }),
  );

  const result = await handlers.quotaUsage({});

  assert.deepEqual(capturedFilter, {
    scopeType: "user",
    scopeId: "active-user",
  });
  assert.deepEqual(result.structuredContent, { summaries });
  assert.equal(result.isError, undefined);
});

test("MCP quota_usage forwards channel filtering with the active user scope", async () => {
  let capturedFilter: QuotaUsageSummaryFilter | undefined;
  const handlers = createMcpToolHandlers(
    makeCoreStub(),
    makeAuthStub(),
    makeReader(async (filter) => {
      capturedFilter = filter;
      return [];
    }),
  );

  const result = await handlers.quotaUsage({ channelId: "channel-a" });

  assert.equal(result.isError, undefined);
  assert.deepEqual(capturedFilter, {
    scopeType: "user",
    scopeId: "active-user",
    channelId: "channel-a",
  });
});

test("MCP quota_usage rejects empty or invalid channel filters", async () => {
  for (const channelId of ["", "   ", "channel/a"]) {
    let authCalls = 0;
    const handlers = createMcpToolHandlers(
      makeCoreStub(),
      makeAuthStub({
        whoami: async () => {
          authCalls += 1;
          return { userId: "active-user" };
        },
      }),
      makeReader(async () => []),
    );

    const result = await handlers.quotaUsage({ channelId });

    assert.equal(result.isError, true);
    assert.equal(authCalls, 0);
    assert.match(result.content[0]?.text ?? "", /validation_failed/);
  }
});

test("MCP quota_usage rejects non-empty input before authentication", async () => {
  let authCalls = 0;
  const auth = makeAuthStub({
    whoami: async () => {
      authCalls += 1;
      return { userId: "active-user" };
    },
  });
  const handlers = createMcpToolHandlers(
    makeCoreStub(),
    auth,
    makeReader(async () => []),
  );

  const result = await handlers.quotaUsage({ userId: "other-user" });

  assert.equal(result.isError, true);
  assert.equal(authCalls, 0);
  assert.match(result.content[0]?.text ?? "", /validation_failed/);
});

test("MCP quota_usage returns authentication failures without querying quota data", async () => {
  let repositoryCalls = 0;
  const handlers = createMcpToolHandlers(
    makeCoreStub(),
    makeAuthStub({
      whoami: async () => {
        throw new Error("auth unavailable");
      },
    }),
    makeReader(async () => {
      repositoryCalls += 1;
      return [];
    }),
  );

  const result = await handlers.quotaUsage({});

  assert.equal(result.isError, true);
  assert.equal(repositoryCalls, 0);
  assert.match(result.content[0]?.text ?? "", /auth unavailable/);
});

test("MCP quota_usage returns repository failures", async () => {
  const handlers = createMcpToolHandlers(
    makeCoreStub(),
    makeAuthStub(),
    makeReader(async () => {
      throw new Error("quota store unavailable");
    }),
  );

  const result = await handlers.quotaUsage({});

  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /quota store unavailable/);
});

test("MCP quota_usage does not expose credentials or permit global queries", async () => {
  let capturedFilter: QuotaUsageSummaryFilter | undefined;
  const handlers = createMcpToolHandlers(
    makeCoreStub(),
    makeAuthStub(),
    makeReader(async (filter) => {
      capturedFilter = filter;
      return [];
    }),
  );

  const result = await handlers.quotaUsage({});
  const serialized = result.content[0]?.text ?? "";

  assert.deepEqual(capturedFilter, {
    scopeType: "user",
    scopeId: "active-user",
  });
  assert.doesNotMatch(
    serialized,
    /must-not-be-exposed|accessToken|refreshToken/,
  );
  assert.doesNotMatch(serialized, /global/);
  assert.equal(result.structuredContent?.mutated, undefined);
});
