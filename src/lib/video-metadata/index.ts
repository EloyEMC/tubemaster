import { getSelectedChannelId, setSelectedChannelId } from "@/lib/db";
import { createDurableQuotaAccountantFactory } from "@/lib/quota/accountant";
import { createWriteContextYoutubeApiAdapter } from "@/lib/write-context/adapters/youtube-api";
import { createWriteContextService } from "@/lib/write-context/service";
import { createMetadataGenerator } from "./adapters/metadata-generator";
import { createDefaultLogger } from "./adapters/logger";
import { createTranscriptProvider } from "./adapters/transcript-provider";
import { createYoutubeApiAdapter } from "./adapters/youtube-api";
import { resolveGoogleCredentials } from "./adapters/google-auth";
import { createVideoMetadataServices } from "./services";

function defaultAuthResolver() {
  return {
    resolve: resolveGoogleCredentials,
  };
}

export function createVideoMetadataCore() {
  const writeContext = createWriteContextService({
    youtubeApi: createWriteContextYoutubeApiAdapter(),
    channelSelectionStore: {
      getSelectedChannelId,
      setSelectedChannelId,
    },
  });

  const services = createVideoMetadataServices({
    authResolver: defaultAuthResolver(),
    youtubeApi: createYoutubeApiAdapter(),
    transcriptProvider: createTranscriptProvider(),
    metadataGenerator: createMetadataGenerator(),
    logger: createDefaultLogger(),
    writeContext,
    channelSelectionStore: {
      setSelectedChannelId,
    },
    quotaAccountantFactory: createDurableQuotaAccountantFactory(),
  });

  return services;
}

export type VideoMetadataCore = ReturnType<typeof createVideoMetadataCore>;
