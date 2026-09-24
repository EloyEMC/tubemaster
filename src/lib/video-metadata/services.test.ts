import assert from "node:assert/strict";
import test from "node:test";
import type {
  MetadataDraft,
  ResolvedCredentials,
  TranscriptResult,
  VideoMetadataItem,
} from "./contracts";
import { DomainError } from "./contracts";
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

    function makeBaseline(videoId = "video-1") {
      return {
        snippet: {
          title: `Original title${videoId === "video-1" ? "" : ` ${videoId}`}`,
          description: `Original description${videoId === "video-1" ? "" : ` ${videoId}`}`,
          categoryId: "22",
          defaultLanguage: "es",
          tags: ["youtube", "metadata"],
        },
        localizations: {
          es: { title: "Título original", description: "Descripción original" },
          en: { title: "Original title EN", description: "Original description EN" },
        },
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

    test("confirmMetadataBatch returns a deterministic read-only confirmation envelope", async () => {
      const services = createVideoMetadataServices(makeDeps());
      const input = {
        credentialRef: { userId: "user-1" },
        items: [
          {
            videoId: "BaBaBaBaBa1",
            proposedTitle: "First title",
            proposedDescription: "First description",
            baseline: makeBaseline("BaBaBaBaBa1"),
          },
          {
            videoId: "BaBaBaBaBa2",
            proposedTitle: "Second title",
            proposedDescription: "Second description",
            baseline: makeBaseline("BaBaBaBaBa2"),
          }
        ],
        expectedChannelId: "UC1234567890123456789012",
        confirmed: true,
      };

      const first = await services.confirmMetadataBatch(input);
      const second = await services.confirmMetadataBatch({ ...input, credentialRef: { userId: "user-2" } });

      assert.deepEqual(first, second);
      assert.equal(first.confirmed, true);
      assert.deepEqual(first.items, input.items);
      assert.equal(first.expectedChannelId, input.expectedChannelId);
      assert.match(first.confirmationId, /^[a-f0-9]{64}$/);

      const reordered = await services.confirmMetadataBatch({
        ...input,
        items: [...input.items].reverse(),
      });
      assert.notEqual(reordered.confirmationId, first.confirmationId);
    });

    test("confirmMetadataBatch never calls provider or write dependencies", async () => {
      let providerCalls = 0;
      let writeCalls = 0;
      const services = createVideoMetadataServices(
        makeDeps({
          authResolver: { resolve: async () => { providerCalls += 1; return makeCredentials(); } },
          youtubeApi: {
            getVideo: async () => { providerCalls += 1; return makeVideo(); },
            applyMetadataProposal: async () => { providerCalls += 1; },
          },
          writeContext: { assertWriteChannel: async () => { writeCalls += 1; throw new Error("must not call"); } },
          channelSelectionStore: { setSelectedChannelId: async () => { writeCalls += 1; } },
        })
      );

      await services.confirmMetadataBatch({
        credentialRef: { userId: "user-1" },
        items: [{ videoId: "BaBaBaBaBa1", proposedTitle: "Title", proposedDescription: "Description", baseline: makeBaseline("BaBaBaBaBa1") }],
        expectedChannelId: "UC1234567890123456789012",
        confirmed: true,
      });

      assert.equal(providerCalls, 0);
      assert.equal(writeCalls, 0);
    });

    test("confirmMetadataBatch rejects invalid confirmation payloads", async () => {
      const services = createVideoMetadataServices(makeDeps());
      const base = {
        credentialRef: { userId: "user-1" },
        items: [{ videoId: "BaBaBaBaBa1", proposedTitle: "Title", proposedDescription: "Description", baseline: makeBaseline("BaBaBaBaBa1") }],
        expectedChannelId: "UC1234567890123456789012",
        confirmed: true,
      };

      for (const invalid of [
        { ...base, items: [] },
        { ...base, items: [{ ...base.items[0], videoId: "invalid" }] },
        { ...base, items: [base.items[0], base.items[0]] },
        { ...base, items: [{ ...base.items[0], proposedTitle: "" }] },
        { ...base, expectedChannelId: "invalid" },
        { ...base, confirmed: false },
      ]) {
        await assert.rejects(
          () => services.confirmMetadataBatch(invalid),
          (error: unknown) => error instanceof DomainError && error.code === "validation_failed"
        );
      }
    });

    test("previewMetadataBatch preserves requested order and transcript states", async () => {
      const calls: string[] = [];
      const services = createVideoMetadataServices(
        makeDeps({
          youtubeApi: {
            getVideo: async ({ videoId }) => {
              calls.push(`video:${videoId}`);
              return { ...makeVideo(), videoId };
            },
          },
          transcriptProvider: {
            getTranscript: async ({ videoId }) =>
              videoId === "BaBaBaBaBa2"
                ? { status: "unsupported", reason: "provider-missing" }
                : { status: "unavailable", reason: "no-captions" },
          },
        })
      );

      const result = await services.previewMetadataBatch({
        credentialRef: { userId: "user-1" },
        videoIds: ["BaBaBaBaBa1", "BaBaBaBaBa2"],
        editorialPrompt: "Make it clear",
      });

      assert.deepEqual(calls, ["video:BaBaBaBaBa1", "video:BaBaBaBaBa2"]);
      assert.deepEqual(result.items.map((item) => item.video.videoId), [
        "BaBaBaBaBa1",
        "BaBaBaBaBa2",
      ]);
      assert.deepEqual(result.items.map((item) => item.transcript.status), [
        "unavailable",
        "unsupported",
      ]);
      assert.equal(result.items[0]?.draft.finalTitle, "Final title");
    });

    test("previewMetadataBatch rejects empty, duplicate, and malformed video IDs", async () => {
      const services = createVideoMetadataServices(makeDeps());

      for (const videoIds of [[], ["BaBaBaBaBa1", "BaBaBaBaBa1"], ["invalid"]]) {
        await assert.rejects(
          () =>
            services.previewMetadataBatch({
              credentialRef: { userId: "user-1" },
              videoIds,
              editorialPrompt: "Make it clear",
            }),
          (error: unknown) =>
            error instanceof DomainError &&
            error.code === "validation_failed" &&
            Array.isArray(error.details)
        );
      }
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

    test("executeMetadataBatch rejects tampered confirmation before auth or provider access", async () => {
      let authCalls = 0;
      const services = createVideoMetadataServices(
        makeDeps({ authResolver: { resolve: async () => { authCalls += 1; return makeCredentials(); } } })
      );
      const envelope = await services.confirmMetadataBatch({
        credentialRef: { userId: "user-1" },
        items: [{ videoId: "BaBaBaBaBa1", proposedTitle: "Title", proposedDescription: "Description", baseline: makeBaseline("BaBaBaBaBa1") }],
        expectedChannelId: "UC1234567890123456789012",
        confirmed: true,
      });

      await assert.rejects(
        () => services.executeMetadataBatch({ ...envelope, confirmationId: "f".repeat(64), credentialRef: { userId: "user-1" } }),
        (error: unknown) => error instanceof DomainError && error.code === "validation_failed"
      );
      assert.equal(authCalls, 0);
    });

    test("executeMetadataBatch preflights every item before sequential writes and returns provider failures", async () => {
      const writes: string[] = [];
      const services = createVideoMetadataServices(
        makeDeps({
          youtubeApi: {
            getVideoMetadataContext: async ({ videoId }) => ({
              snippet: { title: `Old ${videoId}`, description: `Old ${videoId}`, defaultLanguage: "es", channelId: "UC1234567890123456789012", categoryId: "22" },
              localizations: { es: { title: `Old ${videoId}`, description: `Old ${videoId}` } },
            }),
            applyMetadataProposal: async ({ proposal }) => {
              writes.push(proposal.update.videoId);
              if (proposal.update.videoId === "BaBaBaBaBa2") throw new DomainError({ code: "update_failed", message: "provider failed" });
            },
          },
          writeContext: { assertWriteChannel: async () => ({ expectedChannelId: "UC1234567890123456789012", shouldPersistSelection: false, userId: null }) },
        })
      );
      const input = {
        credentialRef: { userId: "user-1" },
        items: [
          { videoId: "BaBaBaBaBa1", proposedTitle: "New 1", proposedDescription: "New 1", baseline: { snippet: { title: "Old BaBaBaBaBa1", description: "Old BaBaBaBaBa1", defaultLanguage: "es", channelId: "UC1234567890123456789012", categoryId: "22" }, localizations: { es: { title: "Old BaBaBaBaBa1", description: "Old BaBaBaBaBa1" } } } },
          { videoId: "BaBaBaBaBa2", proposedTitle: "New 2", proposedDescription: "New 2", baseline: { snippet: { title: "Old BaBaBaBaBa2", description: "Old BaBaBaBaBa2", defaultLanguage: "es", channelId: "UC1234567890123456789012", categoryId: "22" }, localizations: { es: { title: "Old BaBaBaBaBa2", description: "Old BaBaBaBaBa2" } } } },
        ],
        expectedChannelId: "UC1234567890123456789012",
        confirmed: true as const,
      };
      const envelope = await services.confirmMetadataBatch(input);
      const result = await services.executeMetadataBatch({ ...envelope, credentialRef: input.credentialRef });

      assert.deepEqual(writes, ["BaBaBaBaBa1", "BaBaBaBaBa2"]);
      assert.deepEqual(result.outcomes.map((outcome) => outcome.status), ["success", "provider-failure"]);
    });

        test("executeMetadataBatch rejects stale provider metadata before any write", async () => {
          let writeCalls = 0;
          const services = createVideoMetadataServices(
            makeDeps({
              youtubeApi: {
                getVideoMetadataContext: async () => ({
                  snippet: { title: "Changed title", description: "Original description", defaultLanguage: "es", channelId: "UC1234567890123456789012", categoryId: "22" },
                  localizations: { es: { title: "Título original", description: "Descripción original" } },
                }),
                applyMetadataProposal: async () => { writeCalls += 1; },
              },
              writeContext: { assertWriteChannel: async () => ({ expectedChannelId: "UC1234567890123456789012", shouldPersistSelection: false, userId: null }) },
            })
          );
          const input = {
            credentialRef: { userId: "user-1" },
            items: [{ videoId: "BaBaBaBaBa1", proposedTitle: "New title", proposedDescription: "New description", baseline: makeBaseline("BaBaBaBaBa1") }],
            expectedChannelId: "UC1234567890123456789012",
            confirmed: true as const,
          };
          const envelope = await services.confirmMetadataBatch(input);

          await assert.rejects(
            () => services.executeMetadataBatch({ ...envelope, credentialRef: input.credentialRef }),
            (error: unknown) => error instanceof DomainError && error.code === "validation_failed" && /stale/.test(error.message)
          );
          assert.equal(writeCalls, 0);
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
