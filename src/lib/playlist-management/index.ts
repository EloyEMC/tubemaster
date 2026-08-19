import { getSelectedChannelId, setSelectedChannelId } from "@/lib/db";
import { createDurableQuotaAccountantFactory } from "@/lib/quota/accountant";
import { createWriteContextYoutubeApiAdapter } from "@/lib/write-context/adapters/youtube-api";
import { createWriteContextService } from "@/lib/write-context/service";
import { resolveGoogleCredentials } from "@/lib/video-metadata/adapters/google-auth";
import { createDefaultLogger } from "@/lib/video-metadata/adapters/logger";
import { createPlaylistYoutubeApiAdapter } from "./adapters/youtube-api";
import { createPlaylistManagementServices } from "./services";

function defaultAuthResolver() {
  return {
    resolve: resolveGoogleCredentials,
  };
}

export function createPlaylistManagementCore() {
  const writeContext = createWriteContextService({
    youtubeApi: createWriteContextYoutubeApiAdapter(),
    channelSelectionStore: {
      getSelectedChannelId,
      setSelectedChannelId,
    },
  });

  return createPlaylistManagementServices({
    authResolver: defaultAuthResolver(),
    youtubeApi: createPlaylistYoutubeApiAdapter(),
    writeContext,
    channelSelectionStore: {
      setSelectedChannelId,
    },
    logger: createDefaultLogger(),
    quotaAccountantFactory: createDurableQuotaAccountantFactory(),
  });
}

export type PlaylistManagementCore = ReturnType<
  typeof createPlaylistManagementCore
>;
