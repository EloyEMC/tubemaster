import { createGoogleOAuthClient } from "@/lib/auth";
import { mapProviderError } from "@/lib/provider-errors";
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
    }) {
      try {
        const youtube = createAuthorizedClient(args.credentials);
        const channelId = args.channelId ?? (await getMyChannelId(youtube));

        if (!channelId) {
          throw new DomainError({
            code: "unauthorized",
            message: "Cannot resolve channel for the current credentials",
          });
        }

        return await listVideosByChannel({ youtube, channelId, maxResults: args.maxResults });
      } catch (error) {
        throw mapProviderError(error, "update_failed", {
          ...(args.channelId ? { channelId: args.channelId } : {}),
        });
      }
    },

    async getVideo(args: { credentials: ResolvedCredentials; videoId: string }) {
      try {
        const youtube = createAuthorizedClient(args.credentials);
        const video = await getVideoById(youtube, args.videoId);

        if (!video) {
          throw new DomainError({
            code: "not_found",
            message: "Video not found",
            details: { videoId: args.videoId },
          });
        }

        return video;
      } catch (error) {
        throw mapProviderError(error, "update_failed", { videoId: args.videoId });
      }
    },

    async getVideoMetadataContext(args: { credentials: ResolvedCredentials; videoId: string }) {
      try {
        const youtube = createAuthorizedClient(args.credentials);
        const context = await getVideoMetadataContext(youtube, args.videoId);

        if (!context) {
          throw new DomainError({
            code: "not_found",
            message: "Video metadata context not found",
            details: { videoId: args.videoId },
          });
        }

        return JSON.parse(JSON.stringify(context)) as VideoMetadataContext;
      } catch (error) {
        throw mapProviderError(error, "update_failed", { videoId: args.videoId });
      }
    },

    async applyMetadataProposal(args: {
      credentials: ResolvedCredentials;
      proposal: MetadataSyncProposal;
    }) {
      const targetLocalization = args.proposal.update.localizations[args.proposal.targetLanguage];

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
        const youtube = createAuthorizedClient(args.credentials);
        await applyVideoMetadataUpdate({
          youtube,
          update: args.proposal.update,
        });
      } catch (error) {
        throw mapProviderError(error, "update_failed", {
          videoId: args.proposal.update.videoId,
        });
      }
    },
  };
}
