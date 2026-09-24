import assert from "node:assert/strict";
import test from "node:test";
import type {
  MetadataDraft,
  ResolvedCredentials,
  TranscriptResult,
  VideoMetadataItem,
} from "./contracts";
import { DomainError } from "./contracts";
import {
  createVideoMetadataServices,
  type ServiceDependencies,
} from "./services";
import { InMemoryQuotaAccountant } from "../quota/accountant";

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
  operationIdFactory?: ServiceDependencies["operationIdFactory"];
  quotaAccountant?: ServiceDependencies["quotaAccountant"];
};

function makeDeps(overrides?: ServiceDependencyOverrides): ServiceDependencies {
  const credentials = makeCredentials();
  const video = makeVideo();
  const transcript: TranscriptResult = {
    status: "available",
    text: "transcript",
  };
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
      en: {
        title: "Original title EN",
        description: "Original description EN",
      },
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

test("listVideos returns typed list when credentials are valid", async () => {
  const services = createVideoMetadataServices(makeDeps());

  const result = await services.listVideos({
    credentialRef: { userId: "user-1" },
    maxResults: 5,
  });

  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0]?.videoId, "video-1");
});

test("listVideos emits correlated lifecycle events with safe context", async () => {
  const events: Array<{ event: string; context?: Record<string, unknown> }> =
    [];
  const services = createVideoMetadataServices(
    makeDeps({
      operationIdFactory: () => "list-operation",
      logger: {
        info: (payload) => events.push(payload),
        error: (payload) => events.push(payload),
      },
    }),
  );

  await services.listVideos({
    credentialRef: { userId: "user-1" },
    channelId: "channel-1",
  });

  assert.deepEqual(events, [
    {
      event: "video_metadata.list.started",
      context: { operationId: "list-operation" },
    },
    {
      event: "video_metadata.list.success",
      context: {
        operationId: "list-operation",
        count: 1,
      },
    },
  ]);
});

test("listVideos emits one safe error event when the adapter fails", async () => {
  const events: Array<{ event: string; context?: Record<string, unknown> }> =
    [];
  const services = createVideoMetadataServices(
    makeDeps({
      operationIdFactory: () => "list-error-operation",
      youtubeApi: {
        listVideos: async () => {
          throw new Error("provider secret");
        },
      },
      logger: {
        info: (payload) => events.push(payload),
        error: (payload) => events.push(payload),
      },
    }),
  );

  await assert.rejects(() =>
    services.listVideos({ credentialRef: { userId: "user-1" } }),
  );

  assert.deepEqual(events, [
    {
      event: "video_metadata.list.started",
      context: { operationId: "list-error-operation" },
    },
    {
      event: "video_metadata.list.error",
      context: {
        operationId: "list-error-operation",
        code: "unauthorized",
      },
    },
  ]);
  assert.equal(
    events.some((entry) => JSON.stringify(entry).includes("provider secret")),
    false,
  );
});

test("listVideos ignores logger failures", async () => {
  const services = createVideoMetadataServices(
    makeDeps({
      logger: {
        info: () => {
          throw new Error("logger failure");
        },
        error: () => {
          throw new Error("logger failure");
        },
      },
    }),
  );

  const result = await services.listVideos({
    credentialRef: { userId: "user-1" },
  });
  assert.equal(result.videos.length, 1);
});

test("listVideos maps unknown adapter errors to unauthorized", async () => {
  const services = createVideoMetadataServices(
    makeDeps({
      youtubeApi: {
        listVideos: async () => {
          throw new Error("forbidden");
        },
      },
    }),
  );

  await assert.rejects(
    () => services.listVideos({ credentialRef: { userId: "user-1" } }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "unauthorized",
  );
});

test("getTranscript emits correlated lifecycle events", async () => {
  const events: Array<{ event: string; context?: Record<string, unknown> }> =
    [];
  const services = createVideoMetadataServices(
    makeDeps({
      operationIdFactory: () => "transcript-operation",
      logger: {
        info: (payload) => events.push(payload),
        error: (payload) => events.push(payload),
      },
    }),
  );

  await services.getTranscript({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
  });

  assert.deepEqual(events, [
    {
      event: "video_metadata.transcript.started",
      context: { operationId: "transcript-operation", videoId: "video-1" },
    },
    {
      event: "video_metadata.transcript.success",
      context: {
        operationId: "transcript-operation",
        videoId: "video-1",
        status: "available",
      },
    },
  ]);
});

test("getTranscript keeps available status", async () => {
  const services = createVideoMetadataServices(makeDeps());

  const result = await services.getTranscript({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
  });

  assert.equal(result.transcript.status, "available");
});

test("getTranscript rejects invalid input without calling the provider", async () => {
  let providerCalls = 0;
  const services = createVideoMetadataServices(
    makeDeps({
      transcriptProvider: {
        getTranscript: async () => {
          providerCalls += 1;
          return { status: "available", text: "unused" };
        },
      },
    }),
  );

  await assert.rejects(
    () =>
      services.getTranscript({
        credentialRef: { userId: "user-1" },
        videoId: "",
      }),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === "validation_failed" &&
      error.message === "Invalid transcript input",
  );
  assert.equal(providerCalls, 0);
});

test("getTranscript rejects invalid adapter output", async () => {
  const services = createVideoMetadataServices(
    makeDeps({
      transcriptProvider: {
        getTranscript: async () => ({ status: "available", text: "" }),
      },
    }),
  );

  await assert.rejects(
    () =>
      services.getTranscript({
        credentialRef: { userId: "user-1" },
        videoId: "video-1",
      }),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === "validation_failed" &&
      error.message === "Invalid transcript output",
  );
});

test("getTranscript keeps unavailable status", async () => {
  const services = createVideoMetadataServices(
    makeDeps({
      transcriptProvider: {
        getTranscript: async () => ({
          status: "unavailable",
          reason: "no-captions",
        }),
      },
    }),
  );

  const result = await services.getTranscript({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
  });

  assert.deepEqual(result.transcript, {
    status: "unavailable",
    reason: "no-captions",
  });
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
    }),
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
        getTranscript: async () => ({
          status: "unsupported",
          reason: "provider-missing",
        }),
      },
    }),
  );

  const result = await services.getTranscript({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
  });

  assert.deepEqual(result.transcript, {
    status: "unsupported",
    reason: "provider-missing",
  });
});

test("previewMetadata emits correlated lifecycle events with bounded status", async () => {
  const events: Array<{ event: string; context?: Record<string, unknown> }> =
    [];
  const services = createVideoMetadataServices(
    makeDeps({
      operationIdFactory: () => "preview-operation",
      logger: {
        info: (payload) => events.push(payload),
        error: (payload) => events.push(payload),
      },
    }),
  );

  await services.previewMetadata({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
    editorialPrompt: "private prompt",
  });

  assert.deepEqual(events, [
    {
      event: "video_metadata.preview.started",
      context: { operationId: "preview-operation", videoId: "video-1" },
    },
    {
      event: "video_metadata.preview.success",
      context: {
        operationId: "preview-operation",
        videoId: "video-1",
        status: "available",
      },
    },
  ]);
  assert.equal(JSON.stringify(events).includes("private prompt"), false);
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
        getTranscript: async () => ({
          status: "unavailable",
          reason: "no-captions",
        }),
      },
      metadataGenerator: {
        generate: async ({ transcript }) => {
          receivedTranscriptStatus = transcript.status;
          return makeDraft();
        },
      },
    }),
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
    }),
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
        getTranscript: async () => ({
          status: "unsupported",
          reason: "provider-missing",
        }),
      },
      metadataGenerator: {
        generate: async ({ transcript }) => {
          receivedTranscriptStatus = transcript.status;
          return makeDraft();
        },
      },
    }),
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

test("applyMetadata dryRun and apply share the exact same proposed payload", async () => {
  let applyCalls = 0;
  const services = createVideoMetadataServices(
    makeDeps({
      youtubeApi: {
        applyMetadataProposal: async () => {
          applyCalls += 1;
        },
      },
    }),
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
  assert.deepEqual(
    dryRunResult.localizations.proposed,
    applyResult.localizations.proposed,
  );
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
    }),
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
      }),
    );

    const result = await services.applyMetadata({
      credentialRef: { userId: "user-1" },
      videoId: "video-1",
      finalTitle: "Nuevo",
      description: "Descripción",
      expectedChannelId: "UC_ACTIVE",
      dryRun: true,
    });

    assert.equal(
      result.targetLanguage,
      testCase.expectedLanguage,
      testCase.name,
    );
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
      }),
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
      blockingCase.name,
    );

    assert.equal(applyCalls, 0, `${blockingCase.name} should not mutate`);
  }
});

test("applyMetadata emits correlated success trace with safe context", async () => {
  const events: Array<{ event: string; context?: Record<string, unknown> }> =
    [];
  const services = createVideoMetadataServices(
    makeDeps({
      operationIdFactory: () => "operation-1",
      logger: {
        info: (payload) => events.push(payload),
        error: (payload) => events.push(payload),
      },
    }),
  );

  await services.applyMetadata({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
    finalTitle: "Sensitive title",
    description: "Sensitive description",
    expectedChannelId: "UC_ACTIVE",
  });

  assert.deepEqual(
    events.map(({ event }) => event),
    ["video_metadata.apply.started", "video_metadata.apply.success"],
  );
  for (const entry of events) {
    assert.deepEqual(Object.keys(entry.context ?? {}).sort(), [
      "dryRun",
      "expectedChannelId",
      "operationId",
      "videoId",
    ]);
    assert.equal(entry.context?.operationId, "operation-1");
    assert.equal("description" in (entry.context ?? {}), false);
  }
});

test("applyMetadata emits dry-run trace without mutating", async () => {
  const events: string[] = [];
  let applyCalls = 0;
  const services = createVideoMetadataServices(
    makeDeps({
      operationIdFactory: () => "dry-run-operation",
      logger: {
        info: ({ event }) => events.push(event),
        error: ({ event }) => events.push(event),
      },
      youtubeApi: {
        applyMetadataProposal: async () => {
          applyCalls += 1;
        },
      },
    }),
  );

  const result = await services.applyMetadata({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
    finalTitle: "New title",
    description: "New description",
    expectedChannelId: "UC_ACTIVE",
    dryRun: true,
  });

  assert.equal(result.dryRun, true);
  assert.equal(applyCalls, 0);
  assert.deepEqual(events, [
    "video_metadata.apply.started",
    "video_metadata.apply.dry_run",
  ]);
});

test("applyMetadata reuses injected operation ID for provider failures", async () => {
  const events: Array<{ event: string; context?: Record<string, unknown> }> =
    [];
  const services = createVideoMetadataServices(
    makeDeps({
      operationIdFactory: () => "failed-operation",
      logger: {
        info: (payload) => events.push(payload),
        error: (payload) => events.push(payload),
      },
      youtubeApi: {
        applyMetadataProposal: async () => {
          throw new Error("provider secret details");
        },
      },
    }),
  );

  await assert.rejects(
    () =>
      services.applyMetadata({
        credentialRef: { userId: "user-1" },
        videoId: "video-1",
        finalTitle: "New title",
        description: "New description",
        expectedChannelId: "UC_ACTIVE",
      }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "update_failed",
  );

  assert.equal(events[1]?.event, "video_metadata.apply.error");
  assert.equal(events[1]?.context?.operationId, "failed-operation");
  assert.equal(events[1]?.context?.code, "update_failed");
  assert.equal("message" in (events[1]?.context ?? {}), false);
});

test("applyMetadata traces guardrail rejection without exposing details", async () => {
  const events: Array<{ event: string; context?: Record<string, unknown> }> =
    [];
  const services = createVideoMetadataServices(
    makeDeps({
      operationIdFactory: () => "guardrail-operation",
      logger: {
        info: (payload) => events.push(payload),
        error: (payload) => events.push(payload),
      },
      writeContext: {
        assertWriteChannel: async () => {
          throw new DomainError({
            code: "WRITE_CHANNEL_MISMATCH",
            message: "secret guardrail details",
          });
        },
      },
    }),
  );

  await assert.rejects(
    () =>
      services.applyMetadata({
        credentialRef: { userId: "user-1" },
        videoId: "video-1",
        finalTitle: "New title",
        description: "New description",
        expectedChannelId: "UC_EXPECTED",
      }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "WRITE_CHANNEL_MISMATCH",
  );

  assert.deepEqual(events[1]?.context, {
    code: "WRITE_CHANNEL_MISMATCH",
    dryRun: false,
    expectedChannelId: "UC_EXPECTED",
    operationId: "guardrail-operation",
    videoId: "video-1",
  });
});

test("applyMetadata ignores logger failures", async () => {
  const services = createVideoMetadataServices(
    makeDeps({
      operationIdFactory: () => "logger-failure-operation",
      logger: {
        info: () => {
          throw new Error("logger unavailable");
        },
        error: () => {
          throw new Error("logger unavailable");
        },
      },
    }),
  );

  const result = await services.applyMetadata({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
    finalTitle: "New title",
    description: "New description",
    expectedChannelId: "UC_ACTIVE",
  });
  assert.equal(result.dryRun, false);
});

test("applyMetadata fails closed when write-channel guardrail rejects", async () => {
  let applyCalls = 0;
  const services = createVideoMetadataServices(
    makeDeps({
      writeContext: {
        assertWriteChannel: async () => {
          throw new DomainError({
            code: "WRITE_CHANNEL_MISMATCH",
            message:
              "expectedChannelId does not match the active write channel",
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
    }),
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
    (error: unknown) =>
      error instanceof DomainError && error.code === "WRITE_CHANNEL_MISMATCH",
  );

  assert.equal(applyCalls, 0);
});

test("applyMetadata accounts attempted reads and update with one operation ID", async () => {
  const accountant = new InMemoryQuotaAccountant();
  let updateCalls = 0;
  const services = createVideoMetadataServices(
    makeDeps({
      operationIdFactory: () => "quota-operation",
      quotaAccountant: accountant,
      youtubeApi: {
        applyMetadataProposal: async () => {
          updateCalls += 1;
        },
      },
    }),
  );
  const input = {
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
    finalTitle: "New title",
    description: "New description",
    expectedChannelId: "UC_ACTIVE",
  };
  await services.applyMetadata({ ...input, dryRun: true });
  assert.deepEqual(
    accountant.entries().map((entry) => [entry.operationId, entry.operation]),
    [
      ["quota-operation", "channels.list"],
      ["quota-operation", "videos.list"],
    ],
  );
  await services.applyMetadata(input);
  assert.deepEqual(
    accountant.entries().map((entry) => entry.operation),
    [
      "channels.list",
      "videos.list",
      "channels.list",
      "videos.list",
      "videos.update",
    ],
  );
  assert.equal(updateCalls, 1);
});

test("applyMetadata isolates accountant failures", async () => {
  const services = createVideoMetadataServices(
    makeDeps({
      quotaAccountant: {
        record: () => {
          throw new Error("accountant unavailable");
        },
      },
    }),
  );
  const result = await services.applyMetadata({
    credentialRef: { userId: "user-1" },
    videoId: "video-1",
    finalTitle: "New title",
    description: "New description",
    expectedChannelId: "UC_ACTIVE",
  });
  assert.equal(result.dryRun, false);
});

test("applyMetadata accounts attempted operations when guardrail or provider rejects", async () => {
  const guardrailAccountant = new InMemoryQuotaAccountant();
  const guardrailServices = createVideoMetadataServices(
    makeDeps({
      operationIdFactory: () => "guardrail-quota",
      quotaAccountant: guardrailAccountant,
      writeContext: {
        assertWriteChannel: async () => {
          throw new DomainError({
            code: "WRITE_CHANNEL_MISMATCH",
            message: "rejected",
          });
        },
      },
    }),
  );
  await assert.rejects(() =>
    guardrailServices.applyMetadata({
      credentialRef: { userId: "user-1" },
      videoId: "video-1",
      finalTitle: "t",
      description: "d",
      expectedChannelId: "UC_EXPECTED",
    }),
  );
  assert.deepEqual(
    guardrailAccountant.entries().map((entry) => entry.operation),
    ["channels.list"],
  );
  const providerAccountant = new InMemoryQuotaAccountant();
  const providerServices = createVideoMetadataServices(
    makeDeps({
      operationIdFactory: () => "provider-quota",
      quotaAccountant: providerAccountant,
      youtubeApi: {
        applyMetadataProposal: async () => {
          throw new Error("provider failure");
        },
      },
    }),
  );
  await assert.rejects(() =>
    providerServices.applyMetadata({
      credentialRef: { userId: "user-1" },
      videoId: "video-1",
      finalTitle: "t",
      description: "d",
      expectedChannelId: "UC_ACTIVE",
    }),
  );
  assert.deepEqual(
    providerAccountant.entries().map((entry) => entry.operation),
    ["channels.list", "videos.list", "videos.update"],
  );
});
