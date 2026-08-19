import { createGoogleOAuthClient } from "../../auth";
import { DomainError } from "../../video-metadata/contracts";
import type { ResolvedCredentials } from "../../video-metadata/contracts";
import type { AnalyticsDayRow } from "../contracts";

type Response = {
  rows?: unknown[][] | null;
  columnHeaders?: { name: string }[];
};
const params = (startDate: string, endDate: string) => ({
  ids: "channel==MINE",
  startDate,
  endDate,
  metrics: "views,likes,comments,estimatedMinutesWatched",
  dimensions: "day",
  sort: "day",
});

export function createYoutubeAnalyticsApi(
  factory?: () => {
    reports: { query(args: Record<string, unknown>): Promise<Response> };
  },
) {
  return {
    async query(args: {
      credentials: ResolvedCredentials;
      startDate: string;
      endDate: string;
    }): Promise<AnalyticsDayRow[]> {
      try {
        let response: Response;
        if (factory)
          response = await factory().reports.query(
            params(args.startDate, args.endDate),
          );
        else {
          const { google } = await import("googleapis");
          const oauth2 = createGoogleOAuthClient();
          oauth2.setCredentials({
            access_token: args.credentials.accessToken,
            refresh_token: args.credentials.refreshToken,
          });
          response = (await google
            .youtubeAnalytics({ version: "v2", auth: oauth2 })
            .reports.query(params(args.startDate, args.endDate))) as Response;
        }
        const headers = new Map(
          (response.columnHeaders ?? []).map((h, i) => [h.name, i]),
        );
        return (response.rows ?? []).map((row) => {
          const value = (name: string) => Number(row[headers.get(name) ?? -1]);
          const [date, views, likes, comments, estimatedMinutesWatched] = [
            "day",
            "views",
            "likes",
            "comments",
            "estimatedMinutesWatched",
          ].map((name) =>
            headers.has(name)
              ? name === "day"
                ? String(row[headers.get(name)!])
                : value(name)
              : NaN,
          ) as [string, number, number, number, number];
          if (
            !date ||
            ![views, likes, comments, estimatedMinutesWatched].every(
              Number.isFinite,
            )
          )
            throw new DomainError({
              code: "unauthorized",
              message: "Malformed analytics response",
            });
          return { date, views, likes, comments, estimatedMinutesWatched };
        });
      } catch (err) {
        if (err instanceof DomainError) throw err;
        throw new DomainError({
          code: "unauthorized",
          message: "YouTube Analytics request failed",
        });
      }
    },
  };
}
