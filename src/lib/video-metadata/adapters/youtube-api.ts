import { createGoogleOAuthClient } from "@/lib/auth";
import type { QuotaAccountant } from "@/lib/quota/accountant";
import {
  applyVideoMetadataUpdate,
  createYoutubeClient,
  getMyChannelId,
  getVideoById,
  getVideoMetadataContext,
  listVideosByChannel,
} from "@/lib/youtube";
import {
  DomainError,
  type MetadataSyncProposal,
  type ResolvedCredentials,
  type VideoMetadataContext,
} from "../contracts";

export function cloneVideoMetadataContext(
  context: VideoMetadataContext,
): VideoMetadataContext {
  try {
    return structuredClone(context);
  } catch {
    throw new DomainError({
      code: "validation_failed",
      message: "Video metadata context cannot be safely cloned",
    });
  }
}

function createAuthorizedClient(credentials: ResolvedCredentials) {
  const oauth2 = createGoogleOAuthClient();
  oauth2.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
  });

  return createYoutubeClient(oauth2);
}

export function createYoutubeApiAdapter() {
  return {
    async listVideos(args: {
      credentials: ResolvedCredentials;
      channelId?: string;
      maxResults?: number;
      operationId?: string;
      quotaAccountant?: QuotaAccountant;
    }) {
      const youtube = createAuthorizedClient(args.credentials);
      const channelId = args.channelId ?? (await getMyChannelId(youtube, {
        operationId: args.operationId,
        quotaAccountant: args.quotaAccountant,
      }));

      if (!channelId) {
        throw new DomainError({
          code: "unauthorized",
          message: "Cannot resolve channel for the current credentials",
        });
      }

      return listVideosByChannel({
        youtube,
        channelId,
        maxResults: args.maxResults,
        operationId: args.operationId,
        quotaAccountant: args.quotaAccountant,
      });
    },

    async getVideo(args: {
      credentials: ResolvedCredentials;
      videoId: string;
      operationId?: string;
      quotaAccountant?: QuotaAccountant;
    }) {
      const youtube = createAuthorizedClient(args.credentials);
      const video = await getVideoById(youtube, args.videoId, {
        operationId: args.operationId,
        quotaAccountant: args.quotaAccountant,
      });
      if (!video) {
        throw new DomainError({
          code: "not_found",
          message: "Video not found",
          details: { videoId: args.videoId },
        });
      }

      return video;
    },

    async getVideoMetadataContext(args: {
      credentials: ResolvedCredentials;
      videoId: string;
    }) {
      const youtube = createAuthorizedClient(args.credentials);
      const context = await getVideoMetadataContext(youtube, args.videoId);

      if (!context) {
        throw new DomainError({
          code: "not_found",
          message: "Video metadata context not found",
          details: { videoId: args.videoId },
        });
      }

      return cloneVideoMetadataContext(context as VideoMetadataContext);
    },

    async applyMetadataProposal(args: {
      credentials: ResolvedCredentials;
      proposal: MetadataSyncProposal;
    }) {
      const youtube = createAuthorizedClient(args.credentials);
      const targetLocalization =
        args.proposal.update.localizations[args.proposal.targetLanguage];

      if (!targetLocalization) {
        throw new DomainError({
          code: "validation_failed",
          message: "Proposal missing target localization payload",
          details: {
            targetLanguage: args.proposal.targetLanguage,
          },
        });
      }

      try {
        await applyVideoMetadataUpdate({
          youtube,
          update: args.proposal.update,
        });
      } catch (error) {
        throw new DomainError({
          code: "update_failed",
          message: "Failed to update YouTube metadata",
          details: {
            videoId: args.proposal.update.videoId,
            cause: error instanceof Error ? error.message : String(error),
          },
        });
      }
    },
  };
}
