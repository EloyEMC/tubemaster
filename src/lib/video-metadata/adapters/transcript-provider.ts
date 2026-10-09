import { createGoogleOAuthClient } from "@/lib/auth";
import { createYoutubeClient } from "@/lib/youtube";
import { createYtDlpTranscriptProvider } from "./yt-dlp-transcript-provider";
import type {
  ResolvedCredentials,
  TranscriptDiagnostic,
  TranscriptDiagnosticStage,
  TranscriptResult,
  TranscriptUnavailableReason,
} from "../contracts";

type OAuthClientLike = {
  setCredentials(payload: { access_token: string; refresh_token?: string }): void;
};

type CaptionItem = {
  id?: string;
  snippet?: { language?: string };
};

type YoutubeClientLike = {
  captions: {
    list(args: {
      part: string[];
      videoId: string;
    }): Promise<{ data: { items?: CaptionItem[] } }>;
    download(
      args: { id: string; tfmt: "srt" },
      options: { responseType: "arraybuffer" }
    ): Promise<{ data: ArrayBuffer | Buffer | string }>;
  };
};

export type TranscriptProvider = {
  requiresCredentials?: boolean;
  getTranscript(args: {
    credentials?: ResolvedCredentials;
    videoId: string;
  }): Promise<TranscriptResult>;
};

type TranscriptProviderDeps = {
  provider?: string;
  providers?: TranscriptProvider[];
  createPublicProvider?: () => TranscriptProvider;
  createOAuthClient?: () => OAuthClientLike;
  createYoutubeClient?: (oauth: OAuthClientLike) => YoutubeClientLike;
};

const RATE_LIMIT_REASONS = new Set(["ratelimitexceeded", "userratelimitexceeded", "quotaexceeded"]);
const PERMISSIONS_REASONS = new Set([
  "insufficientpermissions",
  "insufficientpermission",
  "autherror",
  "accessnotconfigured",
]);
const CAPTIONS_NOT_DOWNLOADABLE_REASONS = new Set([
  "captionnotfound",
  "cannotdownload",
  "captionsdisabled",
]);
const TRANSIENT_API_REASONS = new Set(["backenderror", "internalerror"]);

    const TRANSCRIPT_TIMESTAMP =
      /^\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{1,2}:\d{2}:\d{2}[,.]\d{3}(?:\s+.*)?\s*$/;
    const INLINE_TIMESTAMP = /<\d{1,2}:\d{2}:\d{2}[,.]\d{3}>/g;
    const BASIC_MARKUP = /<\/?(?:b|i|u|c(?:\.[^ >]+)?|v(?:\s+[^>]*)?|lang(?:\s+[^>]*)?)>/gi;
    const CUE_METADATA = /^(?:NOTE|STYLE|REGION|X-TIMESTAMP-MAP)\b/i;
    const CUE_TIMING = /^\S*\d\S*\s+-->\s+\S*\d\S*(?:\s+.*)?$/;

    function normalizeTranscript(text: string) {
      const normalizedLines = text.replace(/\r\n?/g, "\n").split("\n");
      const contentLines: string[] = [];
      const blocks = normalizedLines.join("\n").split(/\n{2,}/);

      for (const block of blocks) {
        const lines = block.split("\n").map((line) => line.trim());
        if (lines.length === 0 || lines.every((line) => line === "")) continue;
        if (CUE_METADATA.test(lines[0])) continue;

        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          if (line.replace(/^\uFEFF/, "").toUpperCase() === "WEBVTT") continue;
          if (TRANSCRIPT_TIMESTAMP.test(line) || CUE_TIMING.test(line)) continue;
          if (/^\d+$/.test(line) && (TRANSCRIPT_TIMESTAMP.test(lines[index + 1] ?? "") || CUE_TIMING.test(lines[index + 1] ?? ""))) continue;
          const cleaned = line
            .replace(INLINE_TIMESTAMP, "")
            .replace(BASIC_MARKUP, "")
            .replace(/\s+/g, " ")
            .trim();
          if (cleaned) contentLines.push(cleaned);
        }
      }

      const result: string[] = [];
      for (const line of contentLines) {
        if (result[result.length - 1] !== line) result.push(line);
      }
      return result.join("\n");
    }

    function decodeTranscriptPayload(payload: unknown): string {
      try {
        if (typeof payload === "string") return payload;
        if (payload instanceof ArrayBuffer) {
          return Buffer.from(new Uint8Array(payload)).toString("utf8");
        }
        if (Buffer.isBuffer(payload)) return payload.toString("utf8");
      } catch {
        return "";
      }
      return "";
    }

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function sanitizeReason(value: unknown) {
  if (typeof value !== "string") return undefined;
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 80);

  return sanitized.length > 0 ? sanitized : undefined;
}

function extractHttpStatus(error: unknown) {
  const root = asRecord(error);
  const directStatus = root?.status;
  if (typeof directStatus === "number" && Number.isInteger(directStatus)) {
    return directStatus;
  }

  const response = asRecord(root?.response);
  const responseStatus = response?.status;
  if (typeof responseStatus === "number" && Number.isInteger(responseStatus)) {
    return responseStatus;
  }

  return undefined;
}

function extractApiReason(error: unknown) {
  const root = asRecord(error);
  const response = asRecord(root?.response);
  const data = asRecord(response?.data);
  const dataError = asRecord(data?.error);

  const candidateReasons = [
    Array.isArray(dataError?.errors)
      ? asRecord(dataError.errors[0])?.reason
      : undefined,
    asRecord(root?.error)?.reason,
    root?.reason,
  ];

  for (const candidate of candidateReasons) {
    const sanitized = sanitizeReason(candidate);
    if (sanitized) return sanitized;
  }

  return undefined;
}

function mapUnavailableReason(args: {
  stage: TranscriptDiagnosticStage;
  apiReason?: string;
  httpStatus?: number;
}): { reason: TranscriptUnavailableReason; retriable: boolean } {
  const apiReason = args.apiReason;
  if (apiReason) {
    if (RATE_LIMIT_REASONS.has(apiReason)) {
      return { reason: "rate-limited", retriable: true };
    }

    if (PERMISSIONS_REASONS.has(apiReason)) {
      return { reason: "permissions-insufficient", retriable: false };
    }

    if (CAPTIONS_NOT_DOWNLOADABLE_REASONS.has(apiReason)) {
      return { reason: "captions-not-downloadable", retriable: false };
    }

    if (apiReason === "forbidden") {
      return {
        reason:
          args.stage === "captions-download"
            ? "captions-not-downloadable"
            : "permissions-insufficient",
        retriable: false,
      };
    }

    if (TRANSIENT_API_REASONS.has(apiReason)) {
      return { reason: "api-error", retriable: true };
    }
  }

  if (args.httpStatus === 429) {
    return { reason: "rate-limited", retriable: true };
  }

  if (typeof args.httpStatus === "number" && args.httpStatus >= 500 && args.httpStatus <= 599) {
    return { reason: "api-error", retriable: true };
  }

  if (args.httpStatus === 403) {
    return {
      reason:
        args.stage === "captions-download"
          ? "captions-not-downloadable"
          : "permissions-insufficient",
      retriable: false,
    };
  }

  return { reason: "unknown", retriable: false };
}

function classifyTranscriptError(args: {
  stage: TranscriptDiagnosticStage;
  error: unknown;
}): Extract<TranscriptResult, { status: "unavailable" }> {
  const httpStatus = extractHttpStatus(args.error);
  const apiReason = extractApiReason(args.error);
  const mapped = mapUnavailableReason({
    stage: args.stage,
    apiReason,
    httpStatus,
  });

  const diagnostic: TranscriptDiagnostic = {
    stage: args.stage,
    ...(typeof httpStatus === "number" ? { httpStatus } : {}),
    ...(apiReason ? { apiReason } : {}),
    retriable: mapped.retriable,
  };

  return {
    status: "unavailable",
    reason: mapped.reason,
    diagnostic,
  };
}

function createYoutubeTranscriptProvider(deps: TranscriptProviderDeps) {
  const createOAuthClient =
    deps.createOAuthClient ?? (() => createGoogleOAuthClient() as unknown as OAuthClientLike);
  const createYoutube =
    deps.createYoutubeClient ??
    ((oauth: OAuthClientLike) =>
      createYoutubeClient(oauth as unknown as Parameters<typeof createYoutubeClient>[0]) as
        unknown as YoutubeClientLike);

  return {
    async getTranscript(args: {
      credentials?: ResolvedCredentials;
      videoId: string;
    }): Promise<TranscriptResult> {
      if (!args.credentials) {
        return { status: "unsupported", reason: "provider-missing" };
      }
      const oauth2 = createOAuthClient();
      oauth2.setCredentials({
        access_token: args.credentials.accessToken,
        refresh_token: args.credentials.refreshToken,
      });

      const youtube = createYoutube(oauth2);

      let listRes: Awaited<ReturnType<YoutubeClientLike["captions"]["list"]>>;
      try {
        listRes = await youtube.captions.list({
          part: ["snippet"],
          videoId: args.videoId,
        });
      } catch (error) {
        return classifyTranscriptError({ stage: "captions-list", error });
      }

      const caption = listRes.data.items?.find((item) => item.id);
      if (!caption?.id) {
        return {
          status: "unavailable",
          reason: "no-captions",
        };
      }

      let downloadRes: Awaited<ReturnType<YoutubeClientLike["captions"]["download"]>>;
      try {
        downloadRes = await youtube.captions.download(
          {
            id: caption.id,
            tfmt: "srt",
          },
          {
            responseType: "arraybuffer",
          }
        );
      } catch (error) {
        return classifyTranscriptError({ stage: "captions-download", error });
      }

      const rawText = decodeTranscriptPayload(downloadRes.data);
      const normalizedText = normalizeTranscript(rawText);

      if (!normalizedText) {
        return {
          status: "unavailable",
          reason: "no-captions",
        };
      }

      return {
        status: "available",
        text: normalizedText,
        ...(caption.snippet?.language !== undefined
          ? { language: caption.snippet.language }
          : {}),
      };
    },
  };
}

function isFallbackEligible(result: TranscriptResult) {
  return (
    result.status === "unsupported" ||
    (result.status === "unavailable" &&
      (result.reason === "no-captions" || result.reason === "captions-not-downloadable"))
  );
}

export function createTranscriptProvider(deps: TranscriptProviderDeps = {}): TranscriptProvider {
  const provider = deps.provider ?? process.env.YOUTUBE_TRANSCRIPT_PROVIDER ?? "youtube-captions";
  const providers =
    deps.providers ??
    (provider === "youtube-captions"
      ? [createYoutubeTranscriptProvider(deps)]
      : provider === "yt-dlp"
        ? [deps.createPublicProvider?.() ?? createYtDlpTranscriptProvider()]
        : []);

  return {
    requiresCredentials: provider !== "yt-dlp" || deps.providers !== undefined,
    async getTranscript(args) {
      if (providers.length === 0) {
        return { status: "unsupported", reason: "provider-missing" };
      }

      let firstFailure: TranscriptResult | undefined;
      for (const currentProvider of providers) {
        const result = await currentProvider.getTranscript(args);
        if (result.status === "available" || !isFallbackEligible(result)) {
          return result;
        }
        firstFailure ??= result;
      }

      return firstFailure ?? { status: "unsupported", reason: "provider-missing" };
    },
  };
}
