import { randomUUID } from "node:crypto";
import { YOUTUBE_READ_SCOPE, YOUTUBE_WRITE_SCOPE } from "@/lib/auth";
import type { QuotaAccountant, QuotaOperation } from "../quota/accountant";
import {
  DomainError,
  type DeletePlaylistResult,
  isDomainError,
  type AddVideosResult,
  type Playlist,
  type PlaylistMutationFailure,
  type PlaylistMutationFailureReason,
  type PlaylistPrivacyStatus,
  type RemoveVideosResult,
  type ResolvedCredentials,
  type UpdatePlaylistResult,
} from "./contracts";
import {
  parseWithSchema,
  playlistAddVideosInputSchema,
  playlistAddVideosOutputSchema,
  playlistCreateInputSchema,
  playlistCreateOutputSchema,
  playlistDeleteInputSchema,
  playlistDeleteOutputSchema,
  playlistListInputSchema,
  playlistListOutputSchema,
  playlistRemoveVideosInputSchema,
  playlistRemoveVideosOutputSchema,
  playlistUpdateInputSchema,
  playlistUpdateOutputSchema,
} from "./schemas";

type ServiceDependencies = {
  authResolver: {
    resolve(args: {
      credentialRef: unknown;
      requiredScopes: readonly string[];
    }): Promise<ResolvedCredentials>;
  };
  youtubeApi: {
    listPlaylists(args: {
      credentials: ResolvedCredentials;
      operationId?: string;
      quotaAccountant?: QuotaAccountant;
    }): Promise<Playlist[]>;
    createPlaylist(args: {
      credentials: ResolvedCredentials;
      title: string;
      description?: string;
      privacyStatus: PlaylistPrivacyStatus;
    }): Promise<Playlist>;
    getPlaylistForUpdate(args: {
      credentials: ResolvedCredentials;
      playlistId: string;
      operationId?: string;
      quotaAccountant?: QuotaAccountant;
    }): Promise<(Playlist & { channelId: string }) | null>;
    updatePlaylist(args: {
      credentials: ResolvedCredentials;
      playlistId: string;
      title: string;
      description: string;
      privacyStatus: PlaylistPrivacyStatus;
    }): Promise<Playlist>;
    getPlaylistForDelete(args: {
      credentials: ResolvedCredentials;
      playlistId: string;
      operationId?: string;
      quotaAccountant?: QuotaAccountant;
    }): Promise<{ id: string; channelId: string; title: string } | null>;
    deletePlaylist(args: {
      credentials: ResolvedCredentials;
      playlistId: string;
    }): Promise<void>;
    addVideoToPlaylist(args: {
      credentials: ResolvedCredentials;
      playlistId: string;
      videoId: string;
    }): Promise<void>;
    listPlaylistItemIdsByVideo(args: {
      credentials: ResolvedCredentials;
      playlistId: string;
      operationId?: string;
      quotaAccountant?: QuotaAccountant;
    }): Promise<Map<string, string[]>>;
    deletePlaylistItem(args: {
      credentials: ResolvedCredentials;
      playlistItemId: string;
    }): Promise<void>;
  };
  writeContext: {
    assertWriteChannel(args: {
      credentialRef: unknown;
      credentials: ResolvedCredentials;
      expectedChannelId?: string;
    }): Promise<{
      expectedChannelId: string;
      activeWriteChannel: { id: string; title: string | null };
      shouldPersistSelection: boolean;
      userId: string | null;
    }>;
  };
  channelSelectionStore: {
    setSelectedChannelId(userId: string, channelId: string): Promise<void>;
  };
  logger?: {
    info(payload: { event: string; context?: Record<string, unknown> }): void;
    error(payload: { event: string; context?: Record<string, unknown> }): void;
  };
  operationIdFactory?: () => string;
  quotaAccountant?: QuotaAccountant;
  quotaAccountantFactory?: (
    credentials: ResolvedCredentials,
  ) => QuotaAccountant;
};

function resolveQuotaAccountant(
  deps: ServiceDependencies,
  credentials: ResolvedCredentials,
): QuotaAccountant | undefined {
  return deps.quotaAccountant ?? deps.quotaAccountantFactory?.(credentials);
}

function safeLog(
  logger: ServiceDependencies["logger"],
  level: "info" | "error",
  payload: { event: string; context: Record<string, unknown> },
) {
  try {
    logger?.[level](payload);
  } catch {
    // Logging is observational and cannot change the operation outcome.
  }
}

function safeAccount(
  accountant: QuotaAccountant | undefined,
  operationId: string,
  operation: QuotaOperation,
) {
  try {
    accountant?.record({ operationId, operation });
  } catch {
    // Accounting is observational and cannot change the operation outcome.
  }
}

function mapUnknownError(error: unknown, fallbackCode: DomainError["code"]) {
  if (isDomainError(error)) return error;

  return new DomainError({
    code: fallbackCode,
    message: error instanceof Error ? error.message : "Unknown error",
  });
}

function classifyYoutubeMutationError(
  error: unknown,
  context: "add" | "remove",
): { reason: PlaylistMutationFailureReason; message?: string } {
  if (error instanceof DomainError) {
    return {
      reason: "unknown",
      message: error.message,
    };
  }

  const maybeResponse =
    error && typeof error === "object" && "response" in error
      ? (error as { response?: { status?: number; data?: unknown } }).response
      : undefined;
  const status = maybeResponse?.status;

  const errorReason =
    maybeResponse?.data &&
    typeof maybeResponse.data === "object" &&
    "error" in maybeResponse.data
      ? (
          maybeResponse.data as {
            error?: { errors?: Array<{ reason?: string }> };
          }
        ).error?.errors?.[0]?.reason
      : undefined;

  const normalizedReason = errorReason?.toLowerCase();

  if (
    context === "add" &&
    (status === 409 ||
      normalizedReason === "duplicate" ||
      normalizedReason === "playlistcontainsduplicatevideos")
  ) {
    return {
      reason: "already-present",
      message: error instanceof Error ? error.message : undefined,
    };
  }

  if (status === 403) {
    return {
      reason: "forbidden",
      message: error instanceof Error ? error.message : undefined,
    };
  }

  if (context === "remove" && status === 404) {
    return {
      reason: "not-found-in-playlist",
      message: error instanceof Error ? error.message : undefined,
    };
  }

  if (status && status >= 400) {
    return {
      reason: "api-error",
      message: error instanceof Error ? error.message : undefined,
    };
  }

  return {
    reason: "unknown",
    message: error instanceof Error ? error.message : undefined,
  };
}

export function createPlaylistManagementServices(deps: ServiceDependencies) {
  return {
    async listPlaylists(input: unknown) {
      const parsedInput = parseWithSchema(
        playlistListInputSchema,
        input,
        "playlist list input",
      );
      const operationId = deps.operationIdFactory?.() ?? randomUUID();
      const traceContext = { operationId };
      safeLog(deps.logger, "info", {
        event: "playlist_management.list.started",
        context: traceContext,
      });

      try {
        const credentials = await deps.authResolver.resolve({
          credentialRef: parsedInput.credentialRef,
          requiredScopes: [YOUTUBE_READ_SCOPE],
        });
        const accountant = resolveQuotaAccountant(deps, credentials);

            const playlists = await deps.youtubeApi.listPlaylists({
              credentials,
              operationId,
              quotaAccountant: accountant,
            });
        const output = parseWithSchema(
          playlistListOutputSchema,
          { playlists },
          "playlist list output",
        );
        safeLog(deps.logger, "info", {
          event: "playlist_management.list.success",
          context: { ...traceContext, count: output.playlists.length },
        });
        return output;
      } catch (error) {
        const mapped = mapUnknownError(error, "unauthorized");
        safeLog(deps.logger, "error", {
          event: "playlist_management.list.error",
          context: { ...traceContext, code: mapped.code },
        });
        throw mapped;
      }
    },

    async createPlaylist(input: unknown) {
      const parsedInput = parseWithSchema(
        playlistCreateInputSchema,
        input,
        "playlist create input",
      );
      const operationId = deps.operationIdFactory?.() ?? randomUUID();
      const traceContext = {
        operationId,
        expectedChannelId: parsedInput.expectedChannelId,
      };
      safeLog(deps.logger, "info", {
        event: "playlist_management.create.started",
        context: traceContext,
      });

      try {
        const credentials = await deps.authResolver.resolve({
          credentialRef: parsedInput.credentialRef,
          requiredScopes: [YOUTUBE_WRITE_SCOPE],
        });
        const accountant = resolveQuotaAccountant(deps, credentials);

        const guardrail = await deps.writeContext.assertWriteChannel({
          credentialRef: parsedInput.credentialRef,
          credentials,
          expectedChannelId: parsedInput.expectedChannelId,
        });

        safeAccount(accountant, operationId, "playlists.insert");
        const playlist = await deps.youtubeApi.createPlaylist({
          credentials,
          title: parsedInput.title.trim(),
          description: parsedInput.description,
          privacyStatus: parsedInput.privacyStatus,
        });

        if (guardrail.shouldPersistSelection && guardrail.userId) {
          await deps.channelSelectionStore.setSelectedChannelId(
            guardrail.userId,
            guardrail.expectedChannelId,
          );
        }

        const output = parseWithSchema(
          playlistCreateOutputSchema,
          { playlist },
          "playlist create output",
        );
        safeLog(deps.logger, "info", {
          event: "playlist_management.create.success",
          context: traceContext,
        });
        return output;
      } catch (error) {
        const mapped = mapUnknownError(error, "update_failed");
        safeLog(deps.logger, "error", {
          event: "playlist_management.create.error",
          context: { ...traceContext, code: mapped.code },
        });
        throw mapped;
      }
    },

    async updatePlaylist(input: unknown): Promise<UpdatePlaylistResult> {
      const parsedInput = parseWithSchema(
        playlistUpdateInputSchema,
        input,
        "playlist update input",
      );
      const operationId = deps.operationIdFactory?.() ?? randomUUID();
      const traceContext = {
        operationId,
        playlistId: parsedInput.playlistId,
        expectedChannelId: parsedInput.expectedChannelId,
      };
      safeLog(deps.logger, "info", {
        event: "playlist_management.update.started",
        context: traceContext,
      });

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

        const accountant = resolveQuotaAccountant(deps, credentials);
        const currentPlaylist = await deps.youtubeApi.getPlaylistForUpdate({
          credentials,
          playlistId: parsedInput.playlistId,
          operationId,
          quotaAccountant: accountant,
        });

        if (!currentPlaylist) {
          throw new DomainError({
            code: "not_found",
            message: "Playlist not found",
            details: { playlistId: parsedInput.playlistId },
          });
        }

        if (currentPlaylist.channelId !== guardrail.activeWriteChannel.id) {
          throw new DomainError({
            code: "WRITE_CHANNEL_MISMATCH",
            message: "Playlist does not belong to the active write channel",
            details: {
              expectedChannelId: guardrail.expectedChannelId,
              activeWriteChannelId: currentPlaylist.channelId,
            },
          });
        }

        safeAccount(accountant, operationId, "playlists.update");
        const playlist = await deps.youtubeApi.updatePlaylist({
          credentials,
          playlistId: parsedInput.playlistId,
          title: parsedInput.title ?? currentPlaylist.title,
          description:
            parsedInput.description !== undefined
              ? parsedInput.description
              : currentPlaylist.description,
          privacyStatus:
            parsedInput.privacyStatus ?? currentPlaylist.privacyStatus,
        });

        if (guardrail.shouldPersistSelection && guardrail.userId) {
          await deps.channelSelectionStore.setSelectedChannelId(
            guardrail.userId,
            guardrail.expectedChannelId,
          );
        }

        const output = parseWithSchema(
          playlistUpdateOutputSchema,
          { playlist },
          "playlist update output",
        );
        safeLog(deps.logger, "info", {
          event: "playlist_management.update.success",
          context: traceContext,
        });
        return output;
      } catch (error) {
        const mapped = mapUnknownError(error, "update_failed");
        safeLog(deps.logger, "error", {
          event: "playlist_management.update.error",
          context: { ...traceContext, code: mapped.code },
        });
        throw mapped;
      }
    },

    async deletePlaylist(input: unknown): Promise<DeletePlaylistResult> {
      const parsedInput = parseWithSchema(
        playlistDeleteInputSchema,
        input,
        "playlist delete input",
      );
      const operationId = deps.operationIdFactory?.() ?? randomUUID();
      const traceContext = {
        operationId,
        playlistId: parsedInput.playlistId,
        expectedChannelId: parsedInput.expectedChannelId,
      };
      safeLog(deps.logger, "info", {
        event: "playlist_management.delete.started",
        context: traceContext,
      });

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

        const accountant = resolveQuotaAccountant(deps, credentials);
        const playlist = await deps.youtubeApi.getPlaylistForDelete({
          credentials,
          playlistId: parsedInput.playlistId,
          operationId,
          quotaAccountant: accountant,
        });

        if (!playlist) {
          throw new DomainError({
            code: "not_found",
            message: "Playlist not found",
            details: { playlistId: parsedInput.playlistId },
          });
        }

        if (playlist.channelId !== guardrail.activeWriteChannel.id) {
          throw new DomainError({
            code: "WRITE_CHANNEL_MISMATCH",
            message: "Playlist does not belong to the active write channel",
            details: {
              expectedChannelId: guardrail.expectedChannelId,
              activeWriteChannelId: playlist.channelId,
            },
          });
        }

        safeAccount(accountant, operationId, "playlists.delete");
        await deps.youtubeApi.deletePlaylist({
          credentials,
          playlistId: parsedInput.playlistId,
        });

        if (guardrail.shouldPersistSelection && guardrail.userId) {
          await deps.channelSelectionStore.setSelectedChannelId(
            guardrail.userId,
            guardrail.expectedChannelId,
          );
        }

        const output = parseWithSchema(
          playlistDeleteOutputSchema,
          {
            deleted: true,
            playlistId: parsedInput.playlistId,
          },
          "playlist delete output",
        );
        safeLog(deps.logger, "info", {
          event: "playlist_management.delete.success",
          context: traceContext,
        });
        return output;
      } catch (error) {
        const mapped = mapUnknownError(error, "update_failed");
        safeLog(deps.logger, "error", {
          event: "playlist_management.delete.error",
          context: { ...traceContext, code: mapped.code },
        });
        throw mapped;
      }
    },

    async addVideosToPlaylist(input: unknown): Promise<AddVideosResult> {
      const parsedInput = parseWithSchema(
        playlistAddVideosInputSchema,
        input,
        "playlist add videos input",
      );
      const operationId = deps.operationIdFactory?.() ?? randomUUID();
      const traceContext = {
        operationId,
        playlistId: parsedInput.playlistId,
      };
      safeLog(deps.logger, "info", {
        event: "playlist_management.add.started",
        context: traceContext,
      });

      try {
        const credentials = await deps.authResolver.resolve({
          credentialRef: parsedInput.credentialRef,
          requiredScopes: [YOUTUBE_WRITE_SCOPE],
        });
        const accountant = resolveQuotaAccountant(deps, credentials);

        let added = 0;
        const failures: PlaylistMutationFailure[] = [];

        for (const videoId of parsedInput.videoIds) {
          try {
            safeAccount(accountant, operationId, "playlistItems.insert");
            await deps.youtubeApi.addVideoToPlaylist({
              credentials,
              playlistId: parsedInput.playlistId,
              videoId,
            });
            added += 1;
          } catch (error) {
            const classified = classifyYoutubeMutationError(error, "add");
            failures.push({
              videoId,
              reason: classified.reason,
              ...(classified.message ? { message: classified.message } : {}),
            });
          }
        }

        const output = parseWithSchema(
          playlistAddVideosOutputSchema,
          {
            playlistId: parsedInput.playlistId,
            attempted: parsedInput.videoIds.length,
            added,
            failures,
          },
          "playlist add videos output",
        );
        safeLog(deps.logger, "info", {
          event: "playlist_management.add.success",
          context: {
            ...traceContext,
            attempted: output.attempted,
            added: output.added,
            failureCount: output.failures.length,
          },
        });
        return output;
      } catch (error) {
        const mapped = mapUnknownError(error, "update_failed");
        safeLog(deps.logger, "error", {
          event: "playlist_management.add.error",
          context: { ...traceContext, code: mapped.code },
        });
        throw mapped;
      }
    },

    async removeVideosFromPlaylist(
      input: unknown,
    ): Promise<RemoveVideosResult> {
      const parsedInput = parseWithSchema(
        playlistRemoveVideosInputSchema,
        input,
        "playlist remove videos input",
      );
      const operationId = deps.operationIdFactory?.() ?? randomUUID();
      const traceContext = {
        operationId,
        playlistId: parsedInput.playlistId,
      };
      safeLog(deps.logger, "info", {
        event: "playlist_management.remove.started",
        context: traceContext,
      });

      try {
        const credentials = await deps.authResolver.resolve({
          credentialRef: parsedInput.credentialRef,
          requiredScopes: [YOUTUBE_WRITE_SCOPE],
        });

        const accountant = resolveQuotaAccountant(deps, credentials);

        const itemIdsByVideo = await deps.youtubeApi.listPlaylistItemIdsByVideo(
          {
            credentials,
            playlistId: parsedInput.playlistId,
            operationId,
            quotaAccountant: accountant,
          },
        );

        let removed = 0;
        const failures: PlaylistMutationFailure[] = [];

        for (const videoId of parsedInput.videoIds) {
          const candidateIds = itemIdsByVideo.get(videoId);
          const playlistItemId = candidateIds?.shift();

          if (!playlistItemId) {
            failures.push({
              videoId,
              reason: "not-found-in-playlist",
              message: "Video is not present in playlist",
            });
            continue;
          }

          try {
            safeAccount(accountant, operationId, "playlistItems.delete");
            await deps.youtubeApi.deletePlaylistItem({
              credentials,
              playlistItemId,
            });
            removed += 1;
          } catch (error) {
            const classified = classifyYoutubeMutationError(error, "remove");
            failures.push({
              videoId,
              reason: classified.reason,
              ...(classified.message ? { message: classified.message } : {}),
            });
          }
        }

        const output = parseWithSchema(
          playlistRemoveVideosOutputSchema,
          {
            playlistId: parsedInput.playlistId,
            requested: parsedInput.videoIds.length,
            removed,
            failures,
          },
          "playlist remove videos output",
        );
        safeLog(deps.logger, "info", {
          event: "playlist_management.remove.success",
          context: {
            ...traceContext,
            requested: output.requested,
            removed: output.removed,
            failureCount: output.failures.length,
          },
        });
        return output;
      } catch (error) {
        const mapped = mapUnknownError(error, "update_failed");
        safeLog(deps.logger, "error", {
          event: "playlist_management.remove.error",
          context: { ...traceContext, code: mapped.code },
        });
        throw mapped;
      }
    },
  };
}
