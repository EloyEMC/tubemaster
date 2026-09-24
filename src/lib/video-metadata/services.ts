import { randomUUID } from "node:crypto";
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
  listVideosInputSchema,
  listVideosOutputSchema,
  metadataDraftSchema,
  parseWithSchema,
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
  operationIdFactory?: () => string;
};

export type { ServiceDependencies };

function safeLog(
  logger: ServiceDependencies["logger"],
  level: "info" | "error",
  payload: { event: string; context: Record<string, unknown> },
) {
  try {
    logger[level](payload);
  } catch {
    // Audit failures must never change the operation result.
  }
}

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
      const operationId = deps.operationIdFactory?.() ?? randomUUID();
      const context = { operationId, ...(parsedInput.channelId ? { channelId: parsedInput.channelId } : {}) };
      safeLog(deps.logger, "info", { event: "video_metadata.list.started", context });

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

        safeLog(deps.logger, "info", {
          event: "video_metadata.list.success",
          context: { ...context, count: output.videos.length },
        });

        return output;
      } catch (error) {
            const mapped = mapUnknownError(error, "unauthorized");
            safeLog(deps.logger, "error", {
              event: "video_metadata.list.failure",
              context: { ...context, code: mapped.code },
            });
            throw mapped;
      }
    },

    async getTranscript(input: unknown) {
      const parsedInput = parseWithSchema(transcriptInputSchema, input, "transcript input");
      const operationId = deps.operationIdFactory?.() ?? randomUUID();
      const context = { operationId, videoId: parsedInput.videoId };
      safeLog(deps.logger, "info", { event: "video_metadata.transcript.started", context });

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

            safeLog(deps.logger, "info", {
              event: "video_metadata.transcript.success",
              context: { ...context, status: output.transcript.status },
            });
            return output;
          } catch (error) {
            const mapped = mapUnknownError(error, "transcript_unavailable");
            safeLog(deps.logger, "error", {
              event: "video_metadata.transcript.failure",
              context: { ...context, code: mapped.code },
            });
            throw mapped;
          }
    },

    async previewMetadata(input: unknown) {
      const parsedInput = parseWithSchema(
        previewMetadataInputSchema,
        input,
        "preview metadata input"
      );
      const operationId = deps.operationIdFactory?.() ?? randomUUID();
      const context = { operationId, videoId: parsedInput.videoId };
      safeLog(deps.logger, "info", { event: "video_metadata.preview.started", context });

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

        safeLog(deps.logger, "info", {
          event: "video_metadata.preview.success",
          context: { ...context, status: output.transcript.status },
        });

        return output;
          } catch (error) {
            const mapped = mapUnknownError(error, "generation_failed");
            safeLog(deps.logger, "error", {
              event: "video_metadata.preview.failure",
              context: { ...context, code: mapped.code },
            });
            throw mapped;
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
      const operationId = deps.operationIdFactory?.() ?? randomUUID();
      const context = {
        operationId,
        videoId: parsedInput.videoId,
        dryRun: parsedInput.dryRun,
        ...(parsedInput.expectedChannelId ? { expectedChannelId: parsedInput.expectedChannelId } : {}),
      };
      safeLog(deps.logger, "info", { event: "video_metadata.apply.started", context });

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
          const output = parseWithSchema(
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
          safeLog(deps.logger, "info", { event: "video_metadata.apply.dry_run", context });
          return output;
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

        safeLog(deps.logger, "info", {
          event: "video_metadata.apply.success",
          context: { ...context, dryRun: false, targetLanguage: proposal.targetLanguage },
        });

        return output;
          } catch (error) {
            const mapped = mapUnknownError(error, "update_failed");
            safeLog(deps.logger, "error", {
              event: "video_metadata.apply.failure",
              context: { ...context, code: mapped.code },
            });
            throw mapped;
          }
        },
  };
}
