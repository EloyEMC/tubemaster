import { resolveGoogleCredentials } from "../video-metadata/adapters/google-auth";
import { createDurableQuotaAccountantFactory } from "../quota/accountant";
import { createYoutubeAnalyticsApi } from "./adapters/youtube-analytics-api";
import type { AnalyticsSummaryDependencies } from "./contracts";
import { createYoutubeAnalyticsSummaryService } from "./services";
export type {
  AnalyticsSummaryInput,
  AnalyticsSummaryResult,
  AnalyticsSummaryError,
  AnalyticsSummaryResponse,
  AnalyticsSummaryErrorCode,
} from "./contracts";

export function createYoutubeAnalyticsSummary(
  deps?: Partial<AnalyticsSummaryDependencies>,
) {
  const service = createYoutubeAnalyticsSummaryService({
    ...deps,
    authResolver: deps?.authResolver ?? { resolve: resolveGoogleCredentials },
    youtubeAnalyticsApi:
      deps?.youtubeAnalyticsApi ?? createYoutubeAnalyticsApi(),
    quotaAccountantFactory:
      deps?.quotaAccountantFactory ?? createDurableQuotaAccountantFactory(),
  });
  return { fetchAnalyticsSummary: service };
}
