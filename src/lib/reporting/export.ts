const EXPORT_FORMAT = {
  JSON: "json",
  CSV: "csv",
} as const;

type ExportFormat = (typeof EXPORT_FORMAT)[keyof typeof EXPORT_FORMAT];

const CSV_HEADER = "videoId,title,description,publishedAt";

export interface ExportVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
}

export interface ExportRequest {
  videoIds: string[];
  title?: string;
  format: ExportFormat;
}

export interface ExportResult {
  body: string;
  contentType: string;
  filename: string;
}

export class EmptySelectionError extends Error {
  readonly code = "empty_selection" as const;

  constructor() {
    super("At least one video must be selected");
    this.name = "EmptySelectionError";
  }
}

export class InvalidExportFormatError extends Error {
  readonly code = "invalid_format" as const;

  constructor() {
    super("Export format must be json or csv");
    this.name = "InvalidExportFormatError";
  }
}

export function parseExportRequest(request: Request): ExportRequest {
  const searchParams = new URL(request.url).searchParams;
  const videoIds = searchParams
    .getAll("videoIds")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  if (videoIds.length === 0) {
    throw new EmptySelectionError();
  }

  const title = searchParams.get("title")?.trim() || undefined;
  const format = searchParams.get("format") ?? EXPORT_FORMAT.JSON;
  if (format !== EXPORT_FORMAT.JSON && format !== EXPORT_FORMAT.CSV) {
    throw new InvalidExportFormatError();
  }

  return { videoIds, title, format };
}

export function selectVideos(
  videos: ExportVideo[],
  videoIds: string[],
  title?: string
): ExportVideo[] {
  const videosById = new Map(videos.map((video) => [video.videoId, video]));
  const normalizedTitle = title?.toLocaleLowerCase();
  return videoIds.flatMap((videoId) => {
    const video = videosById.get(videoId);
    if (!video || (normalizedTitle && !video.title.toLocaleLowerCase().includes(normalizedTitle))) {
      return [];
    }
    return [video];
  });
}

export function exportVideos(videos: ExportVideo[], format: ExportFormat): ExportResult {
  if (videos.length === 0) {
    throw new EmptySelectionError();
  }

  if (format === EXPORT_FORMAT.JSON) {
    return {
      body: JSON.stringify(
        videos.map(({ videoId, title, description, publishedAt }) => ({
          videoId,
          title,
          description,
          publishedAt,
        }))
      ),
      contentType: "application/json",
      filename: "videos-export.json",
    };
  }

  return {
    body: `${CSV_HEADER}\n${videos.map((video) => [video.videoId, video.title, video.description, video.publishedAt].map(escapeCsv).join(",")).join("\n")}\n`,
    contentType: "text/csv; charset=utf-8",
    filename: "videos-export.csv",
  };
}

function escapeCsv(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
