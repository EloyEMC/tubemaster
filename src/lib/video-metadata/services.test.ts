import assert from "node:assert/strict";
import test from "node:test";
import type {
  MetadataDraft,
  ResolvedCredentials,
  TranscriptResult,
  VideoMetadataItem,
} from "./contracts";
import { DomainError } from "./contracts";
import { YOUTUBE_READ_SCOPE } from "@/lib/auth";
import { createVideoMetadataServices, type ServiceDependencies } from "./services";

function makeCredentials(): ResolvedCredentials {
  return {
    credentialRef: { userId: "user-1" },
    accessToken: "access-token",
    refreshToken: "refresh-token",
    scopeSet: new Set(["scope-read", "scope-write"]),
  };
}

function makeVideo(): VideoMetadataItem {
  return {
    videoId: "video-1",
    title: "Original title",
    description: "Original description",
    publishedAt: "2024-01-01T00:00:00Z",
  };
}

function makeDraft(): MetadataDraft {
  return {
    finalTitle: "Final title",
    description: "Final description",
    promptVersion: "v1",
  };
}

type ServiceDependencyOverrides = {
  authResolver?: Partial<ServiceDependencies["authResolver"]>;
  youtubeApi?: Partial<ServiceDependencies["youtubeApi"]>;
  transcriptProvider?: Partial<ServiceDependencies["transcriptProvider"]>;
  metadataGenerator?: Partial<ServiceDependencies["metadataGenerator"]>;
  logger?: Partial<ServiceDependencies["logger"]>;
  writeContext?: Partial<ServiceDependencies["writeContext"]>;
  channelSelectionStore?: Partial<ServiceDependencies["channelSelectionStore"]>;
  operationIdFactory?: () => string;
  quotaAccountant?: ServiceDependencies["quotaAccountant"];
};

function makeDeps(overrides?: ServiceDependencyOverrides): ServiceDependencies {
  const credentials = makeCredentials();
  const video = makeVideo();
  const transcript: TranscriptResult = { status: "available", text: "transcript" };
  const draft = makeDraft();
  const metadataContext = {
    snippet: {
      title: "Original title",
      description: "Original description",
      categoryId: "22",
      defaultLanguage: "es",
      tags: ["youtube", "metadata"],
      localized: {
        title: "No debería persistirse",
        description: "Campo read-only",
      },
    },
    localizations: {
      es: { title: "Título original", description: "Descripción original" },
      en: { title: "Original title EN", description: "Original description EN" },
    },
  };

  return {
    authResolver: {
      resolve: async () => credentials,
      ...overrides?.authResolver,
    },
    youtubeApi: {
      listVideos: async () => [video],
      getVideo: async () => video,
      getVideoMetadataContext: async () => metadataContext,
      applyMetadataProposal: async () => undefined,
      ...overrides?.youtubeApi,
    },
    transcriptProvider: {
      getTranscript: async () => transcript,
      ...overrides?.transcriptProvider,
    },
    metadataGenerator: {
      generate: async () => draft,
      ...overrides?.metadataGenerator,
    },
    logger: {
      info: () => undefined,
      error: () => undefined,
      ...overrides?.logger,
    },
    writeContext: {
      assertWriteChannel: async () => ({
        expectedChannelId: "UC_ACTIVE",
        shouldPersistSelection: true,
        userId: "user-1",
      }),
      ...overrides?.writeContext,
    },
    channelSelectionStore: {
      setSelectedChannelId: async () => undefined,
      ...overrides?.channelSelectionStore,
    },
    operationIdFactory: overrides?.operationIdFactory,
    quotaAccountant: overrides?.quotaAccountant,
  };
}

test("explicit public transcript skips credential resolution and carries provider through core", async () => {
  let received: unknown;
  const deps = makeDeps({
    authResolver: { resolve: async () => { throw new Error("OAuth must not run"); } },
    transcriptProvider: { getTranscript: async (args) => { received = args; return { status: "available", text: "Public" }; } },
  });
  const result = await createVideoMetadataServices(deps).getTranscript({ videoId: "abcdefghijk", provider: "yt-dlp" });
  assert.deepEqual(result, { transcript: { status: "available", text: "Public" } });
  assert.deepEqual(received, { videoId: "abcdefghijk", provider: "yt-dlp" });
});

test("audit orders start then dry_run or failure without exposing editorial content", async () => {
  const events: Array<{ event: string; context?: Record<string, unknown> }> = [];
  const deps = makeDeps({ operationIdFactory: () => "op-1", logger: { info: (event) => events.push(event), error: (event) => events.push(event) } });
  const services = createVideoMetadataServices(deps);
  await services.applyMetadata({ credentialRef: { userId: "secret" }, videoId: "video-1", finalTitle: "SECRET TITLE", description: "SECRET DESCRIPTION", expectedChannelId: "UC_ACTIVE", dryRun: true });
  assert.deepEqual(events.map((item) => item.event), ["video_metadata.apply.start", "video_metadata.apply.dry_run"]);
  assert.equal(events[1]?.context?.channelId, "UC_ACTIVE");
  assert.equal(events[0]?.context?.operationId, "op-1");
  assert.equal(events[0]?.context?.dryRun, true);
  assert.equal(JSON.stringify(events).includes("SECRET"), false);
  events.length = 0;
  deps.writeContext.assertWriteChannel = async () => { throw new DomainError({ code: "WRITE_CHANNEL_MISMATCH", message: "secret" }); };
  await assert.rejects(
    () => services.applyMetadata({ credentialRef: { userId: "user-1" }, videoId: "video-1", finalTitle: "Title", description: "Description", expectedChannelId: "UC_OTHER" }),
    { code: "WRITE_CHANNEL_MISMATCH" },
  );
  assert.deepEqual(events.map((item) => item.event), ["video_metadata.apply.start", "video_metadata.apply.failure"]);
  assert.equal(events[1]?.context?.code, "WRITE_CHANNEL_MISMATCH");
});

test("transcript provider failures emit safe code and logger exceptions are isolated", async () => {
  const events: string[] = [];
  const services = createVideoMetadataServices(makeDeps({
    logger: { info: ({ event }) => { events.push(event); throw Error("logger"); }, error: ({ event }) => { events.push(event); throw Error("logger"); } },
    transcriptProvider: { getTranscript: async () => { throw Error("private transcript provider details"); } },
  }));
  await assert.rejects(
    () => services.getTranscript({ credentialRef: { userId: "user-1" }, videoId: "video-1" }),
    { code: "transcript_unavailable" },
  );
  assert.deepEqual(events, ["transcript.get.start", "transcript.get.failure"]);
});

test("listVideos returns typed list when credentials are valid", async () => {
  const services = createVideoMetadataServices(makeDeps());

  const result = await services.listVideos({
    credentialRef: { userId: "user-1" },
    maxResults: 5,
  });

  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0]?.videoId, "video-1");
});

test("listVideos forwards channel-scoped quota context", async () => {
  let capturedInput: unknown;
  const accountant = { record: () => undefined };
  const services = createVideoMetadataServices(
    makeDeps({
      operationIdFactory: () => "operation-1",
      quotaAccountant: accountant,
      youtubeApi: {
        listVideos: async (input) => {
          capturedInput = input;
          return [makeVideo()];
        },
      },
    }),
  );

  await services.listVideos({
    credentialRef: { userId: "user-1" },
    channelId: "UC_ACTIVE",
    maxResults: 5,
  });

  assert.deepEqual(capturedInput, {
    credentials: makeCredentials(),
    channelId: "UC_ACTIVE",
    maxResults: 5,
    operationId: "operation-1",
    quotaAccountant: accountant,
  });
});

test("listVideos maps unknown adapter errors to unauthorized", async () => {
  const services = createVideoMetadataServices(
    makeDeps({
      youtubeApi: {
        listVideos: async () => {
          throw new Error("forbidden");
        },
      },
    })
  );

  await assert.rejects(
    () => services.listVideos({ credentialRef: { userId: "user-1" } }),
    (error: unknown) => error instanceof DomainError && error.code === "unauthorized"
  );
});

test("getTranscript keeps available status", async () => {
  const services = createVideoMetadataServices(makeDeps());

  const result = await services.getTranscript({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
  });

  assert.equal(result.transcript.status, "available");
});

test("getTranscript keeps unavailable status", async () => {
  const services = createVideoMetadataServices(
    makeDeps({
      transcriptProvider: {
        getTranscript: async () => ({ status: "unavailable", reason: "no-captions" }),
      },
    })
  );

  const result = await services.getTranscript({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
  });

  assert.deepEqual(result.transcript, { status: "unavailable", reason: "no-captions" });
});

test("getTranscript preserves granular unavailable reason and diagnostic", async () => {
  const services = createVideoMetadataServices(
    makeDeps({
      transcriptProvider: {
        getTranscript: async () => ({
          status: "unavailable",
          reason: "rate-limited",
          diagnostic: {
            stage: "captions-list",
            httpStatus: 429,
            apiReason: "ratelimitexceeded",
            retriable: true,
          },
        }),
      },
    })
  );

  const result = await services.getTranscript({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
  });

  assert.deepEqual(result.transcript, {
    status: "unavailable",
    reason: "rate-limited",
    diagnostic: {
      stage: "captions-list",
      httpStatus: 429,
      apiReason: "ratelimitexceeded",
      retriable: true,
    },
  });
});

test("getTranscript keeps unsupported status", async () => {
  const services = createVideoMetadataServices(
    makeDeps({
      transcriptProvider: {
        getTranscript: async () => ({ status: "unsupported", reason: "provider-missing" }),
      },
    })
  );

  const result = await services.getTranscript({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
  });

  assert.deepEqual(result.transcript, { status: "unsupported", reason: "provider-missing" });
});

test("previewMetadata returns one finalTitle and one description", async () => {
  const services = createVideoMetadataServices(makeDeps());

  const result = await services.previewMetadata({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
    editorialPrompt: "Make it clear",
  });

  assert.equal(result.draft.finalTitle, "Final title");
  assert.equal(result.draft.description, "Final description");
});

test("previewMetadata remains enabled when transcript is unavailable", async () => {
  let receivedTranscriptStatus: string | undefined;
  const services = createVideoMetadataServices(
    makeDeps({
      transcriptProvider: {
        getTranscript: async () => ({ status: "unavailable", reason: "no-captions" }),
      },
      metadataGenerator: {
        generate: async ({ transcript }) => {
          receivedTranscriptStatus = transcript.status;
          return makeDraft();
        },
      },
    })
  );

  const result = await services.previewMetadata({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
    editorialPrompt: "Keep going",
  });

  assert.equal(receivedTranscriptStatus, "unavailable");
  assert.equal(result.transcript.status, "unavailable");
  assert.equal(result.draft.finalTitle, "Final title");
});

test("previewMetadata keeps working with granular transcript diagnostics", async () => {
  let receivedTranscript: TranscriptResult | undefined;
  const services = createVideoMetadataServices(
    makeDeps({
      transcriptProvider: {
        getTranscript: async () => ({
          status: "unavailable",
          reason: "captions-not-downloadable",
          diagnostic: {
            stage: "captions-download",
            httpStatus: 403,
            apiReason: "forbidden",
            retriable: false,
          },
        }),
      },
      metadataGenerator: {
        generate: async ({ transcript }) => {
          receivedTranscript = transcript;
          return makeDraft();
        },
      },
    })
  );

  const result = await services.previewMetadata({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
    editorialPrompt: "Keep going",
  });

  assert.deepEqual(receivedTranscript, {
    status: "unavailable",
    reason: "captions-not-downloadable",
    diagnostic: {
      stage: "captions-download",
      httpStatus: 403,
      apiReason: "forbidden",
      retriable: false,
    },
  });
  assert.equal(result.transcript.status, "unavailable");
  assert.equal(result.draft.finalTitle, "Final title");
});

test("previewMetadata remains enabled when transcript provider is unsupported", async () => {
  let receivedTranscriptStatus: string | undefined;
  const services = createVideoMetadataServices(
    makeDeps({
      transcriptProvider: {
        getTranscript: async () => ({ status: "unsupported", reason: "provider-missing" }),
      },
      metadataGenerator: {
        generate: async ({ transcript }) => {
          receivedTranscriptStatus = transcript.status;
          return makeDraft();
        },
      },
    })
  );

  const result = await services.previewMetadata({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
    editorialPrompt: "Keep going",
  });

  assert.equal(receivedTranscriptStatus, "unsupported");
  assert.equal(result.transcript.status, "unsupported");
  assert.equal(result.draft.description, "Final description");
});

test("batch confirmation is deterministic, ordered and independent of credentials", async () => {
  const services = createVideoMetadataServices(makeDeps());
  const input = {
    credentialRef: { userId: "user-1" },
    items: [
      { videoId: "BaBaBaBaBa1", proposedTitle: "First", proposedDescription: "Description 1", baseline: { title: "Old", description: "Old description", localizations: {} } },
      { videoId: "BaBaBaBaBa2", proposedTitle: "Second", proposedDescription: "Description 2", baseline: { title: "Old", description: "Old description", localizations: {} } },
    ],
    expectedChannelId: "UC1234567890123456789012",
    confirmed: true,
  };
  const first = await services.confirmMetadataBatch(input);
  assert.deepEqual(first, await services.confirmMetadataBatch({ ...input, credentialRef: { userId: "user-2" } }));
  assert.deepEqual(first.items, input.items);
  assert.match(first.confirmationId, /^[a-f0-9]{64}$/);
  assert.notEqual((await services.confirmMetadataBatch({ ...input, items: [{ ...input.items[0], baseline: { ...input.items[0].baseline, title: "Changed" } }, input.items[1]] })).confirmationId, first.confirmationId);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  assert.notEqual((await services.confirmMetadataBatch({ ...input, items: [...input.items].reverse() })).confirmationId, first.confirmationId);
  assert.notEqual((await services.confirmMetadataBatch({ ...input, expectedChannelId: "UCabcdefghijklmnopqrstuv" })).confirmationId, first.confirmationId);
});

test("batch confirmation rejects invalid payloads without touching dependencies", async () => {
  let calls = 0;
  const services = createVideoMetadataServices(makeDeps({
    authResolver: { resolve: async () => { calls++; throw Error("forbidden"); } },
    youtubeApi: { applyMetadataProposal: async () => { calls++; throw Error("forbidden"); } },
    writeContext: { assertWriteChannel: async () => { calls++; throw Error("forbidden"); } },
    channelSelectionStore: { setSelectedChannelId: async () => { calls++; throw Error("forbidden"); } },
  }));
  const base = {
    credentialRef: { userId: "user-1" },
    items: [{ videoId: "BaBaBaBaBa1", proposedTitle: "Title", proposedDescription: "Description", baseline: { title: "Old", description: "Old description", localizations: {} } }],
    expectedChannelId: "UC1234567890123456789012",
    confirmed: true,
  };
  await services.confirmMetadataBatch(base);
  for (const invalid of [
    { ...base, items: [] },
    { ...base, items: [base.items[0], base.items[0]] },
    { ...base, items: [{ ...base.items[0], videoId: "invalid" }] },
    { ...base, items: [{ ...base.items[0], proposedTitle: "  " }] },
    { ...base, items: [{ ...base.items[0], proposedDescription: "" }] },
    { ...base, expectedChannelId: "invalid" },
    { ...base, confirmed: false },
    { ...base, confirmed: undefined },
    { ...base, unexpected: true },
  ]) {
    await assert.rejects(() => services.confirmMetadataBatch(invalid), { code: "validation_failed" });
  }
  assert.equal(calls, 0);
});

test("batch execution preflights all items before writing and reports provider failures", async () => {
  const channel = "UC1234567890123456789012";
  const ids = ["BaBaBaBaBa1", "BaBaBaBaBa2"];
  const baseline = { title: "Original", description: "Before", localizations: { es: { title: "Viejo", description: "Antes" } } };
  const items = ids.map((videoId) => ({ videoId, proposedTitle: "New", proposedDescription: "After", baseline }));
  const input = { credentialRef: { userId: "user-1" }, items, expectedChannelId: channel, confirmed: true };
  const events: string[] = [];
  let stale = false;
  const services = createVideoMetadataServices(makeDeps({
    authResolver: { resolve: async ({ requiredScopes }) => { events.push(`auth:${requiredScopes.join(",")}`); return makeCredentials(); } },
    writeContext: { assertWriteChannel: async () => ({ expectedChannelId: channel, shouldPersistSelection: false, userId: null }) },
    youtubeApi: {
      getVideoMetadataContext: async ({ videoId }) => {
        events.push(`read:${videoId}`);
        return { snippet: { title: stale && videoId === ids[1] ? "Drift" : baseline.title, description: baseline.description, channelId: channel, defaultLanguage: "es" }, localizations: baseline.localizations };
      },
      applyMetadataProposal: async ({ proposal }) => { events.push(`write:${proposal.update.videoId}`); if (proposal.update.videoId === ids[1]) throw Error("provider unavailable"); },
    },
  }));
  const confirmed = await services.confirmMetadataBatch(input);
  await assert.rejects(() => services.executeMetadataBatch({ ...input, confirmationId: "0".repeat(64) }), { code: "validation_failed" });
  assert.equal(events.length, 0);
  stale = true;
  await assert.rejects(() => services.executeMetadataBatch({ ...input, confirmationId: confirmed.confirmationId }), { code: "validation_failed" });
  assert.equal(events.some((event) => event.startsWith("write:")), false);
  events.length = 0;
  stale = false;
  const result = await services.executeMetadataBatch({ ...input, confirmationId: confirmed.confirmationId });
  assert.deepEqual(events.slice(1), [`read:${ids[0]}`, `read:${ids[1]}`, `write:${ids[0]}`, `write:${ids[1]}`]);
  assert.deepEqual(result.outcomes.map((item) => item.status), ["success", "provider-failure"]);
  assert.equal(result.outcomes[1]?.status === "provider-failure" && result.outcomes[1].error.code, "update_failed");
});

test("batch preview reuses read-only preview in input order with transcript states", async () => {
  const calls: string[] = [];
  const scopes: string[][] = [];
  const services = createVideoMetadataServices(makeDeps({
    authResolver: { resolve: async ({ requiredScopes }) => {
      scopes.push([...requiredScopes]);
      return makeCredentials();
    } },
    youtubeApi: {
      getVideo: async ({ videoId }) => {
        calls.push(`video:${videoId}`);
        return { ...makeVideo(), videoId };
      },
      applyMetadataProposal: async () => { throw Error("write forbidden"); },
    },
    transcriptProvider: { getTranscript: async ({ videoId }) => {
      calls.push(`transcript:${videoId}`);
      return videoId === "BaBaBaBaBa1"
        ? { status: "unavailable", reason: "no-captions" }
        : { status: "unsupported", reason: "provider-missing" };
    } },
    metadataGenerator: { generate: async ({ video }) => {
      calls.push(`draft:${video.videoId}`);
      return makeDraft();
    } },
    writeContext: { assertWriteChannel: async () => { throw Error("write forbidden"); } },
    channelSelectionStore: { setSelectedChannelId: async () => { throw Error("write forbidden"); } },
  }));
  const result = await services.previewMetadataBatch({
    credentialRef: { userId: "user-1" },
    videoIds: ["BaBaBaBaBa1", "BaBaBaBaBa2"],
    editorialPrompt: "Make it clear",
  });
  assert.deepEqual(scopes, [[YOUTUBE_READ_SCOPE], [YOUTUBE_READ_SCOPE]]);
  assert.deepEqual(calls, [
    "video:BaBaBaBaBa1", "transcript:BaBaBaBaBa1", "draft:BaBaBaBaBa1",
    "video:BaBaBaBaBa2", "transcript:BaBaBaBaBa2", "draft:BaBaBaBaBa2",
  ]);
  assert.deepEqual(result.items.map((item) => item.transcript.status), ["unavailable", "unsupported"]);
});

test("batch preview rejects malformed input before adapter calls", async () => {
  let calls = 0;
  const services = createVideoMetadataServices(makeDeps({
    authResolver: { resolve: async () => { calls++; return makeCredentials(); } },
  }));
  for (const videoIds of [[], ["BaBaBaBaBa1", "BaBaBaBaBa1"], ["invalid"],
    Array.from({ length: 51 }, (_, i) => `BaBaBaBa${String(i).padStart(3, "0")}`)]) {
    await assert.rejects(() => services.previewMetadataBatch({
      credentialRef: { userId: "user-1" }, videoIds, editorialPrompt: "prompt",
    }), { code: "validation_failed" });
  }
  await assert.rejects(() => services.previewMetadataBatch({
    credentialRef: { userId: "user-1" }, videoIds: ["BaBaBaBaBa1"], editorialPrompt: "   ",
  }), { code: "validation_failed" });
  assert.equal(calls, 0);
});

test("applyMetadata dryRun and apply share the exact same proposed payload", async () => {
  let applyCalls = 0;
  const services = createVideoMetadataServices(
    makeDeps({
      youtubeApi: {
        applyMetadataProposal: async () => {
          applyCalls += 1;
        },
      },
    })
  );

  const input = {
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
    finalTitle: "New title",
    description: "New description",
    expectedChannelId: "UC_ACTIVE",
  };

  const dryRunResult = await services.applyMetadata({ ...input, dryRun: true });
  const applyResult = await services.applyMetadata(input);

  assert.equal(dryRunResult.dryRun, true);
  assert.equal(applyResult.dryRun, false);
  assert.equal(applyCalls, 1);
  assert.deepEqual(dryRunResult.snippet.proposed, applyResult.snippet.proposed);
  assert.deepEqual(dryRunResult.localizations.proposed, applyResult.localizations.proposed);
  assert.equal(dryRunResult.targetLanguage, "es");
});

test("applyMetadata preserves non-editorial snippet fields and non-target localizations", async () => {
  let capturedProposal: unknown;
  const services = createVideoMetadataServices(
    makeDeps({
      youtubeApi: {
        applyMetadataProposal: async ({ proposal }) => {
          capturedProposal = proposal;
        },
      },
    })
  );

  const result = await services.applyMetadata({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
    finalTitle: "Updated title",
    description: "Updated description",
    expectedChannelId: "UC_ACTIVE",
  });

  assert.equal(result.dryRun, false);
  assert.equal(result.targetLanguage, "es");
  assert.equal(result.languageSource, "defaultLanguage");
  assert.equal(result.snippet.proposed.title, "Updated title");
  assert.equal(result.snippet.proposed.description, "Updated description");
  assert.equal(result.snippet.proposed.categoryId, "22");
  assert.equal(result.snippet.proposed.defaultLanguage, "es");
  assert.equal("localized" in result.snippet.proposed, false);
  assert.deepEqual(result.localizations.proposed.en, {
    title: "Original title EN",
    description: "Original description EN",
  });

  const proposal = capturedProposal as {
    update: {
      localizations: Record<string, { title: string; description: string }>;
      snippet: Record<string, unknown>;
    };
  };

  assert.equal(proposal.update.snippet.categoryId, "22");
  assert.deepEqual(proposal.update.localizations.en, {
    title: "Original title EN",
    description: "Original description EN",
  });
});

test("applyMetadata resolves target language from defaultLanguage or single localization fallback", async () => {
  const testCases = [
    {
      name: "defaultLanguage",
      context: {
        snippet: {
          title: "t",
          description: "d",
          categoryId: "22",
          defaultLanguage: "es",
        },
        localizations: {
          es: { title: "t", description: "d" },
          en: { title: "t-en", description: "d-en" },
        },
      },
      expectedLanguage: "es",
      expectedSource: "defaultLanguage",
    },
    {
      name: "single-localization-fallback",
      context: {
        snippet: {
          title: "t",
          description: "d",
          categoryId: "22",
        },
        localizations: {
          pt: { title: "t-pt", description: "d-pt" },
        },
      },
      expectedLanguage: "pt",
      expectedSource: "existing-localization",
    },
  ] as const;

  for (const testCase of testCases) {
    const services = createVideoMetadataServices(
      makeDeps({
        youtubeApi: {
          getVideoMetadataContext: async () => testCase.context,
        },
      })
    );

    const result = await services.applyMetadata({
      credentialRef: { userId: "user-1" },
      videoId: "video-1",
      finalTitle: "Nuevo",
      description: "Descripción",
      expectedChannelId: "UC_ACTIVE",
      dryRun: true,
    });

    assert.equal(result.targetLanguage, testCase.expectedLanguage, testCase.name);
    assert.equal(result.languageSource, testCase.expectedSource, testCase.name);
  }
});

test("applyMetadata blocks when target language is not uniquely resolvable", async () => {
  const blockingCases = [
    {
      name: "missing-default-and-no-localizations",
      context: {
        snippet: { title: "t", description: "d", categoryId: "22" },
        localizations: {},
      },
    },
    {
      name: "missing-default-and-ambiguous-localizations",
      context: {
        snippet: { title: "t", description: "d", categoryId: "22" },
        localizations: {
          es: { title: "t-es", description: "d-es" },
          en: { title: "t-en", description: "d-en" },
        },
      },
    },
  ] as const;

  for (const blockingCase of blockingCases) {
    let applyCalls = 0;
    const services = createVideoMetadataServices(
      makeDeps({
        youtubeApi: {
          getVideoMetadataContext: async () => blockingCase.context,
          applyMetadataProposal: async () => {
            applyCalls += 1;
          },
        },
      })
    );

    await assert.rejects(
      () =>
        services.applyMetadata({
          credentialRef: { userId: "user-1" },
          videoId: "video-1",
          finalTitle: "Nuevo",
          description: "Descripción",
          expectedChannelId: "UC_ACTIVE",
          dryRun: true,
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === "target_language_unresolvable" &&
        /Cannot resolve target language/.test(error.message),
      blockingCase.name
    );

    assert.equal(applyCalls, 0, `${blockingCase.name} should not mutate`);
  }
});

test("applyMetadata fails closed when write-channel guardrail rejects", async () => {
  let applyCalls = 0;
  const services = createVideoMetadataServices(
    makeDeps({
      writeContext: {
        assertWriteChannel: async () => {
          throw new DomainError({
            code: "WRITE_CHANNEL_MISMATCH",
            message: "expectedChannelId does not match the active write channel",
            details: {
              expectedChannelId: "UC_EXPECTED",
              activeWriteChannelId: "UC_ACTIVE",
            },
          });
        },
      },
      youtubeApi: {
        applyMetadataProposal: async () => {
          applyCalls += 1;
        },
      },
    })
  );

  await assert.rejects(
    () =>
      services.applyMetadata({
        credentialRef: { userId: "user-1" },
        videoId: "video-1",
        finalTitle: "Nuevo",
        description: "Descripción",
        expectedChannelId: "UC_EXPECTED",
        dryRun: false,
      }),
    (error: unknown) => error instanceof DomainError && error.code === "WRITE_CHANNEL_MISMATCH"
  );

  assert.equal(applyCalls, 0);
});
