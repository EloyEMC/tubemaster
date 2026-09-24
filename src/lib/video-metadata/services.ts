import { createHash } from "node:crypto";
import { YOUTUBE_READ_SCOPE, YOUTUBE_WRITE_SCOPE } from "@/lib/auth";
import {
  DomainError,
  isDomainError,
  type MetadataLanguageSource,
  type MetadataApplyResult,
  type MetadataDraft,
  type MetadataSyncProposal,
  type ResolvedCredentials,
  type TranscriptResult,
  type VideoMetadataContext,
  type VideoMetadataItem,
} from "./contracts";
import {
  applyMetadataInputSchema,
  applyMetadataOutputSchema,
  confirmMetadataBatchInputSchema,
  confirmMetadataBatchOutputSchema,
  executeMetadataBatchInputSchema,
  executeMetadataBatchOutputSchema,
  listVideosInputSchema,
  listVideosOutputSchema,
  metadataDraftSchema,
  parseWithSchema,
  previewMetadataBatchInputSchema,
  previewMetadataBatchOutputSchema,
  previewMetadataInputSchema,
  previewMetadataOutputSchema,
  transcriptInputSchema,
  transcriptOutputSchema,
} from "./schemas";

type ServiceDependencies = {
  authResolver: {
    resolve(args: {
      credentialRef: unknown;
      requiredScopes: readonly string[];
    }): Promise<ResolvedCredentials>;
  };
  youtubeApi: {
    listVideos(args: {
      credentials: ResolvedCredentials;
      channelId?: string;
      maxResults?: number;
    }): Promise<VideoMetadataItem[]>;
    getVideo(args: {
      credentials: ResolvedCredentials;
      videoId: string;
    }): Promise<VideoMetadataItem>;
    getVideoMetadataContext(args: {
      credentials: ResolvedCredentials;
      videoId: string;
    }): Promise<VideoMetadataContext>;
    applyMetadataProposal(args: {
      credentials: ResolvedCredentials;
      proposal: MetadataSyncProposal;
    }): Promise<void>;
  };
  transcriptProvider: {
    getTranscript(args: {
      credentials: ResolvedCredentials;
      videoId: string;
    }): Promise<TranscriptResult>;
  };
  metadataGenerator: {
    generate(args: {
      video: VideoMetadataItem;
      transcript: TranscriptResult;
      editorialPrompt: string;
    }): Promise<MetadataDraft>;
  };
  logger: {
    info(payload: { event: string; context?: Record<string, unknown> }): void;
    error(payload: { event: string; context?: Record<string, unknown> }): void;
  };
  writeContext: {
    assertWriteChannel(args: {
      credentialRef: unknown;
      credentials: ResolvedCredentials;
      expectedChannelId?: string;
    }): Promise<{
      expectedChannelId: string;
      shouldPersistSelection: boolean;
      userId: string | null;
    }>;
  };
  channelSelectionStore: {
    setSelectedChannelId(userId: string, channelId: string): Promise<void>;
  };
};

export type { ServiceDependencies };

function mapUnknownError(error: unknown, fallbackCode: DomainError["code"]) {
  if (isDomainError(error)) return error;

  return new DomainError({
    code: fallbackCode,
    message: error instanceof Error ? error.message : "Unknown error",
  });
}

function removeReadOnlySnippetFields(snippet: Record<string, unknown>) {
  const sanitized = { ...snippet };
  delete sanitized.localized;
  return sanitized;
}

function resolveTargetLanguage(context: VideoMetadataContext): {
  targetLanguage: string;
  languageSource: MetadataLanguageSource;
} {
  const defaultLanguage =
    typeof context.snippet.defaultLanguage === "string" &&
    context.snippet.defaultLanguage.trim().length > 0
      ? context.snippet.defaultLanguage.trim()
      : null;

  if (defaultLanguage) {
    return {
      targetLanguage: defaultLanguage,
      languageSource: "defaultLanguage",
    };
  }

  const localizationLocales = Object.keys(context.localizations);
  if (localizationLocales.length === 1) {
    const [inferredLanguage] = localizationLocales;
    if (!inferredLanguage) {
      throw new DomainError({
        code: "target_language_unresolvable",
        message: "Cannot resolve target language from YouTube metadata",
      });
    }

    return {
      targetLanguage: inferredLanguage,
      languageSource: "existing-localization",
    };
  }

  throw new DomainError({
    code: "target_language_unresolvable",
    message:
      "Cannot resolve target language. Set snippet.defaultLanguage on the video or leave exactly one localization.",
    details: {
      videoDefaultLanguage: context.snippet.defaultLanguage ?? null,
      localizationLocales,
    },
  });
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

function createConfirmationPayload(input: {
  items: Array<{
    videoId: string;
    proposedTitle: string;
    proposedDescription: string;
    baseline: {
      snippet: Record<string, unknown>;
      localizations: Record<string, { title: string; description: string }>;
    };
  }>;
  expectedChannelId: string;
  confirmed: true;
}) {
  return {
    items: input.items,
    expectedChannelId: input.expectedChannelId,
    confirmed: input.confirmed,
  };
}

function createConfirmationId(payload: ReturnType<typeof createConfirmationPayload>) {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function metadataBaselineFromContext(context: VideoMetadataContext) {
  return {
    snippet: removeReadOnlySnippetFields(context.snippet),
    localizations: context.localizations,
  };
}

function buildMetadataSyncProposal(args: {
  videoId: string;
  context: VideoMetadataContext;
  draft: MetadataDraft;
}): MetadataSyncProposal {
  const resolvedLanguage = resolveTargetLanguage(args.context);
  const beforeSnippet = removeReadOnlySnippetFields(args.context.snippet);
  const proposedSnippet = removeReadOnlySnippetFields({
    ...beforeSnippet,
    title: args.draft.finalTitle,
    description: args.draft.description,
    defaultLanguage: resolvedLanguage.targetLanguage,
  });

  const beforeLocalizations = { ...args.context.localizations };
  const proposedLocalizations = {
    ...beforeLocalizations,
    [resolvedLanguage.targetLanguage]: {
      ...beforeLocalizations[resolvedLanguage.targetLanguage],
      title: args.draft.finalTitle,
      description: args.draft.description,
    },
  };

  return {
    targetLanguage: resolvedLanguage.targetLanguage,
    languageSource: resolvedLanguage.languageSource,
    snippet: {
      before: beforeSnippet,
      proposed: proposedSnippet,
    },
    localizations: {
      before: beforeLocalizations,
      proposed: proposedLocalizations,
      affected: [
        {
          locale: resolvedLanguage.targetLanguage,
          before: beforeLocalizations[resolvedLanguage.targetLanguage] ?? null,
          proposed: proposedLocalizations[resolvedLanguage.targetLanguage],
          source: resolvedLanguage.languageSource,
        },
      ],
    },
    update: {
      videoId: args.videoId,
      snippet: proposedSnippet,
      localizations: proposedLocalizations,
    },
  };
}

export function createVideoMetadataServices(deps: ServiceDependencies) {
  return {
    async listVideos(input: unknown) {
      const parsedInput = parseWithSchema(listVideosInputSchema, input, "list videos input");

      try {
        const credentials = await deps.authResolver.resolve({
          credentialRef: parsedInput.credentialRef,
          requiredScopes: [YOUTUBE_READ_SCOPE],
        });

        const videos = await deps.youtubeApi.listVideos({
          credentials,
          channelId: parsedInput.channelId,
          maxResults: parsedInput.maxResults,
        });

        const output = parseWithSchema(
          listVideosOutputSchema,
          { videos },
          "list videos output"
        );

        deps.logger.info({
          event: "video_metadata.list.success",
          context: { count: output.videos.length, channelId: parsedInput.channelId ?? "default" },
        });

        return output;
      } catch (error) {
        const mapped = mapUnknownError(error, "unauthorized");
        deps.logger.error({ event: "video_metadata.list.error", context: { code: mapped.code } });
        throw mapped;
      }
    },

    async getTranscript(input: unknown) {
      const parsedInput = parseWithSchema(transcriptInputSchema, input, "transcript input");

      try {
        const credentials = await deps.authResolver.resolve({
          credentialRef: parsedInput.credentialRef,
          requiredScopes: [YOUTUBE_READ_SCOPE],
        });

        const transcript = await deps.transcriptProvider.getTranscript({
          credentials,
          videoId: parsedInput.videoId,
        });

        const output = parseWithSchema(
          transcriptOutputSchema,
          { transcript },
          "transcript output"
        );

        return output;
      } catch (error) {
        throw mapUnknownError(error, "transcript_unavailable");
      }
    },

    async confirmMetadataBatch(input: unknown) {
      const parsedInput = parseWithSchema(
        confirmMetadataBatchInputSchema,
        input,
        "batch metadata confirmation input"
      );
      const canonicalPayload = createConfirmationPayload(parsedInput);
      const confirmationId = createConfirmationId(canonicalPayload);

          return parseWithSchema(
            confirmMetadataBatchOutputSchema,
            { ...canonicalPayload, confirmationId },
            "batch metadata confirmation output"
          );
        },

        async executeMetadataBatch(input: unknown) {
          const parsedInput = parseWithSchema(
            executeMetadataBatchInputSchema,
            input,
            "batch metadata execution input"
          );
          const canonicalPayload = createConfirmationPayload(parsedInput);
          if (createConfirmationId(canonicalPayload) !== parsedInput.confirmationId) {
            throw new DomainError({
              code: "validation_failed",
              message: "Confirmation envelope does not match confirmationId",
            });
          }

          let credentials: ResolvedCredentials;
          try {
            credentials = await deps.authResolver.resolve({
              credentialRef: parsedInput.credentialRef,
              requiredScopes: [YOUTUBE_WRITE_SCOPE],
            });
          } catch (error) {
            throw mapUnknownError(error, "unauthorized");
          }

          try {
            const guardrail = await deps.writeContext.assertWriteChannel({
              credentialRef: parsedInput.credentialRef,
              credentials,
              expectedChannelId: parsedInput.expectedChannelId,
            });

            const proposals: MetadataSyncProposal[] = [];
            for (const item of parsedInput.items) {
              const context = await deps.youtubeApi.getVideoMetadataContext({
                credentials,
                videoId: item.videoId,
              });
              const actualChannelId = context.snippet.channelId;
              if (actualChannelId !== parsedInput.expectedChannelId) {
                throw new DomainError({
                  code: "WRITE_CHANNEL_MISMATCH",
                  message: "Video does not belong to the expected write channel",
                  details: { videoId: item.videoId, expectedChannelId: parsedInput.expectedChannelId, actualChannelId },
                });
              }
              const currentBaseline = metadataBaselineFromContext(context);
              if (canonicalJson(currentBaseline) !== canonicalJson(item.baseline)) {
                throw new DomainError({
                  code: "validation_failed",
                  message: "Confirmed metadata is stale because the provider metadata changed",
                  details: { videoId: item.videoId },
                });
              }
              if (
                context.snippet.title === item.proposedTitle &&
                context.snippet.description === item.proposedDescription
              ) {
                throw new DomainError({
                  code: "validation_failed",
                  message: "Confirmed metadata is stale because it is already applied",
                  details: { videoId: item.videoId },
                });
              }
              proposals.push(buildMetadataSyncProposal({
                videoId: item.videoId,
                context,
                draft: { finalTitle: item.proposedTitle, description: item.proposedDescription, promptVersion: "confirmed-batch" },
              }));
            }

            const outcomes: Array<{ videoId: string; status: "success" | "provider-failure"; error?: { code: string; message: string } }> = [];
            for (const proposal of proposals) {
              try {
                await deps.youtubeApi.applyMetadataProposal({ credentials, proposal });
                outcomes.push({ videoId: proposal.update.videoId, status: "success" });
              } catch (error) {
                const mapped = mapUnknownError(error, "update_failed");
                outcomes.push({ videoId: proposal.update.videoId, status: "provider-failure", error: { code: mapped.code, message: mapped.message } });
              }
            }

            if (guardrail.shouldPersistSelection && guardrail.userId) {
              await deps.channelSelectionStore.setSelectedChannelId(guardrail.userId, guardrail.expectedChannelId);
            }

            return parseWithSchema(
              executeMetadataBatchOutputSchema,
              { confirmationId: parsedInput.confirmationId, expectedChannelId: parsedInput.expectedChannelId, outcomes },
              "batch metadata execution output"
            );
          } catch (error) {
            throw mapUnknownError(error, "update_failed");
          }
        },

        async previewMetadata(input: unknown) {
      const parsedInput = parseWithSchema(
        previewMetadataInputSchema,
        input,
        "preview metadata input"
      );

      try {
        const credentials = await deps.authResolver.resolve({
          credentialRef: parsedInput.credentialRef,
          requiredScopes: [YOUTUBE_READ_SCOPE],
        });

        const video = await deps.youtubeApi.getVideo({
          credentials,
          videoId: parsedInput.videoId,
        });

        const transcriptResult = await deps.transcriptProvider.getTranscript({
          credentials,
          videoId: parsedInput.videoId,
        });

        const draft = await deps.metadataGenerator.generate({
          video,
          transcript: transcriptResult,
          editorialPrompt: parsedInput.editorialPrompt,
        });

        const output = parseWithSchema(
          previewMetadataOutputSchema,
          {
            video,
            transcript: transcriptResult,
            draft,
          },
          "preview metadata output"
        );

        deps.logger.info({
          event: "video_metadata.preview.success",
          context: { videoId: parsedInput.videoId, transcriptStatus: output.transcript.status },
        });

        return output;
      } catch (error) {
        throw mapUnknownError(error, "generation_failed");
      }
    },

        async previewMetadataBatch(input: unknown) {
          const parsedInput = parseWithSchema(
            previewMetadataBatchInputSchema,
            input,
            "batch preview metadata input"
          );

          try {
            const credentials = await deps.authResolver.resolve({
              credentialRef: parsedInput.credentialRef,
              requiredScopes: [YOUTUBE_READ_SCOPE],
            });

            const items = [];
            for (const videoId of parsedInput.videoIds) {
              const video = await deps.youtubeApi.getVideo({ credentials, videoId });
              const transcript = await deps.transcriptProvider.getTranscript({
                credentials,
                videoId,
              });
              const draft = await deps.metadataGenerator.generate({
                video,
                transcript,
                editorialPrompt: parsedInput.editorialPrompt,
              });

              items.push(
                parseWithSchema(
                  previewMetadataOutputSchema,
                  { video, transcript, draft },
                  "preview metadata output"
                )
              );
            }

            return parseWithSchema(
              previewMetadataBatchOutputSchema,
              { items },
              "batch preview metadata output"
            );
          } catch (error) {
            throw mapUnknownError(error, "generation_failed");
          }
        },

        async applyMetadata(input: unknown): Promise<MetadataApplyResult> {
      const parsedInput = parseWithSchema(
        applyMetadataInputSchema,
        input,
        "apply metadata input"
      );

      const draft = parseWithSchema(
        metadataDraftSchema,
        {
          finalTitle: parsedInput.finalTitle,
          description: parsedInput.description,
          promptVersion: "manual-input",
        },
        "metadata draft"
      );

      try {
        const credentials = await deps.authResolver.resolve({
          credentialRef: parsedInput.credentialRef,
          requiredScopes: [YOUTUBE_WRITE_SCOPE],
        });

        const guardrail = await deps.writeContext.assertWriteChannel({
          credentialRef: parsedInput.credentialRef,
          credentials,
          expectedChannelId: parsedInput.expectedChannelId,
        });

        const metadataContext = await deps.youtubeApi.getVideoMetadataContext({
          credentials,
          videoId: parsedInput.videoId,
        });

        const proposal = buildMetadataSyncProposal({
          videoId: parsedInput.videoId,
          context: metadataContext,
          draft,
        });

        if (parsedInput.dryRun) {
          return parseWithSchema(
            applyMetadataOutputSchema,
            {
              dryRun: true,
              videoId: parsedInput.videoId,
              targetLanguage: proposal.targetLanguage,
              languageSource: proposal.languageSource,
              snippet: proposal.snippet,
              localizations: proposal.localizations,
            },
            "apply metadata output"
          );
        }

        await deps.youtubeApi.applyMetadataProposal({
          credentials,
          proposal,
        });

        if (guardrail.shouldPersistSelection && guardrail.userId) {
          await deps.channelSelectionStore.setSelectedChannelId(
            guardrail.userId,
            guardrail.expectedChannelId
          );
        }

        const output = parseWithSchema(
          applyMetadataOutputSchema,
          {
            dryRun: false,
            videoId: parsedInput.videoId,
            targetLanguage: proposal.targetLanguage,
            languageSource: proposal.languageSource,
            snippet: proposal.snippet,
            localizations: proposal.localizations,
          },
          "apply metadata output"
        );

        deps.logger.info({
          event: "video_metadata.apply.success",
          context: {
            videoId: parsedInput.videoId,
            dryRun: false,
            targetLanguage: proposal.targetLanguage,
          },
        });

        return output;
      } catch (error) {
        throw mapUnknownError(error, "update_failed");
      }
    },
  };
}
