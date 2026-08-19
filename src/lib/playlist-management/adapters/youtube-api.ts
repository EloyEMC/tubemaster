import { createGoogleOAuthClient } from "@/lib/auth";
import {
  addVideoToPlaylistForAuthenticated,
  createPlaylistForAuthenticated,
  createYoutubeClient,
  deletePlaylistItemById,
  getPlaylistForDelete as getPlaylistForDeleteFromYoutube,
  getPlaylistForUpdate as getPlaylistForUpdateFromYoutube,
  listPlaylistItemIdsByVideo,
  listPlaylistsForAuthenticated,
  updatePlaylistForAuthenticated,
} from "@/lib/youtube";
import type { QuotaAccountant } from "@/lib/quota/accountant";
import type {
  Playlist,
  PlaylistPrivacyStatus,
  ResolvedCredentials,
} from "../contracts";

function createAuthorizedClient(credentials: ResolvedCredentials) {
  const oauth2 = createGoogleOAuthClient();
  oauth2.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
  });

  return createYoutubeClient(oauth2);
}

export function createPlaylistYoutubeApiAdapter() {
  return {
    async listPlaylists(args: {
      credentials: ResolvedCredentials;
      operationId?: string;
      quotaAccountant?: QuotaAccountant;
    }): Promise<Playlist[]> {
      const youtube = createAuthorizedClient(args.credentials);
      return listPlaylistsForAuthenticated(youtube, args);
    },

    async createPlaylist(args: {
      credentials: ResolvedCredentials;
      title: string;
      description?: string;
      privacyStatus: PlaylistPrivacyStatus;
    }): Promise<Playlist> {
      const youtube = createAuthorizedClient(args.credentials);
      return createPlaylistForAuthenticated(
        youtube,
        args.title,
        args.privacyStatus,
        args.description,
      );
    },

    async getPlaylistForUpdate(args: {
      credentials: ResolvedCredentials;
      playlistId: string;
      operationId?: string;
      quotaAccountant?: QuotaAccountant;
      channelId?: string;
    }) {
      const youtube = createAuthorizedClient(args.credentials);
      return getPlaylistForUpdateFromYoutube(youtube, args.playlistId, args);
    },

    async updatePlaylist(args: {
      credentials: ResolvedCredentials;
      playlistId: string;
      title: string;
      description: string;
      privacyStatus: PlaylistPrivacyStatus;
    }): Promise<Playlist> {
      const youtube = createAuthorizedClient(args.credentials);
      return updatePlaylistForAuthenticated({
        youtube,
        playlistId: args.playlistId,
        title: args.title,
        description: args.description,
        privacyStatus: args.privacyStatus,
      });
    },

    async getPlaylistForDelete(args: {
      credentials: ResolvedCredentials;
      playlistId: string;
      operationId?: string;
      quotaAccountant?: QuotaAccountant;
      channelId?: string;
    }) {
      const youtube = createAuthorizedClient(args.credentials);
      return getPlaylistForDeleteFromYoutube(youtube, args.playlistId, args);
    },

    async deletePlaylist(args: {
      credentials: ResolvedCredentials;
      playlistId: string;
    }) {
      const youtube = createAuthorizedClient(args.credentials);
      await youtube.playlists.delete({ id: args.playlistId });
    },

    async addVideoToPlaylist(args: {
      credentials: ResolvedCredentials;
      playlistId: string;
      videoId: string;
    }) {
      const youtube = createAuthorizedClient(args.credentials);
      await addVideoToPlaylistForAuthenticated(
        youtube,
        args.videoId,
        args.playlistId,
      );
    },

    async listPlaylistItemIdsByVideo(args: {
      credentials: ResolvedCredentials;
      playlistId: string;
      operationId?: string;
      quotaAccountant?: QuotaAccountant;
    }) {
      const youtube = createAuthorizedClient(args.credentials);
      return listPlaylistItemIdsByVideo(youtube, args.playlistId, args);
    },

    async deletePlaylistItem(args: {
      credentials: ResolvedCredentials;
      playlistItemId: string;
    }) {
      const youtube = createAuthorizedClient(args.credentials);
      await deletePlaylistItemById(youtube, args.playlistItemId);
    },
  };
}
