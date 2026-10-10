import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TranscriptResult, TranscriptSegment } from "../contracts";
import { normalizeTranscript } from "../transcript-normalizer";

export type YtDlpRunResult = { exitCode: number | null; stdout: string; stderr: string };
export type YtDlpRunner = (args: string[], timeoutMs: number) => Promise<YtDlpRunResult>;
export type WhisperRunner = (args: string[], timeoutMs: number) => Promise<YtDlpRunResult>;

export type YtDlpProviderDeps = {
  command?: string;
  whisperCommand?: string;
  whisperModel?: string;
  languages?: string[];
  timeoutMs?: number;
  run?: YtDlpRunner;
  whisperRun?: WhisperRunner;
  createTempDirectory?: () => Promise<string>;
  removeTempDirectory?: (path: string) => Promise<void>;
  transcribe?: (audioPath: string, timeoutMs: number) => Promise<string>;
  readWhisperOutput?: (path: string) => Promise<string>;
};

const DEFAULT_LANGUAGES = ["en"];
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_WHISPER_COMMAND = "mlx_whisper";
const DEFAULT_WHISPER_MODEL = "mlx-community/whisper-tiny";

function configuredValue(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function configuredTimeout() {
  const value = configuredValue("TUBEMASTER_TRANSCRIPT_TIMEOUT_MS");
  if (!value) return DEFAULT_TIMEOUT_MS;
  const timeoutMs = Number(value);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
}

function videoUrl(videoId: string) {
  return /^https?:\/\//i.test(videoId) ? videoId : `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function failure(stage: "public-video" | "local-audio" | "local-transcription", errorCode: "timeout" | "process-error" | "non-zero-exit" | "malformed-output" | "configuration-error", retriable = false): TranscriptResult {
  return { status: "unavailable", reason: "unknown", diagnostic: { stage, errorCode, retriable } };
}

function noCaptions(): TranscriptResult { return { status: "unavailable", reason: "no-captions" }; }

function defaultRunner(command: string): YtDlpRunner {
  return (args, timeoutMs) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(Object.assign(new Error("process timed out"), { code: "ETIMEDOUT" }));
    }, timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr });
    });
  });
}

    export function parseWhisperOutput(content: string): { text: string; segments?: TranscriptSegment[] } {
      const parsed: unknown = JSON.parse(content);
      if (typeof parsed !== "object" || parsed === null || !("text" in parsed) || typeof parsed.text !== "string") {
        throw new Error("Whisper output did not contain transcript text");
      }

      if (!("segments" in parsed) || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
        return { text: parsed.text };
      }

      const segments = parsed.segments.map((segment: unknown): TranscriptSegment | null => {
        if (typeof segment !== "object" || segment === null) return null;
        const candidate = segment as { start?: unknown; end?: unknown; text?: unknown };
        if (
          typeof candidate.start !== "number" || !Number.isFinite(candidate.start) || candidate.start < 0 ||
          typeof candidate.end !== "number" || !Number.isFinite(candidate.end) || candidate.end < candidate.start ||
          typeof candidate.text !== "string" || !candidate.text.trim()
        ) return null;
        return { start: candidate.start, end: candidate.end, text: candidate.text };
      });
      if (segments.some((segment) => segment === null)) return { text: parsed.text };
      return { text: parsed.text, segments: segments as TranscriptSegment[] };
    }

export function createYtDlpTranscriptProvider(deps: YtDlpProviderDeps = {}) {
  const languages = [...new Set((deps.languages ?? DEFAULT_LANGUAGES).map((language) => language.trim()).filter(Boolean))];
  const timeoutMs = deps.timeoutMs ?? configuredTimeout();
  const configuredBackend = configuredValue("TUBEMASTER_WHISPER_BACKEND");
  const configuredWhisperCommand = configuredValue("TUBEMASTER_WHISPER_COMMAND");
  const unsupportedBackend = configuredBackend && configuredBackend !== "mlx_whisper" && !configuredWhisperCommand && !deps.whisperCommand;
  const run = deps.run ?? defaultRunner(deps.command ?? configuredValue("TUBEMASTER_YTDLP_COMMAND") ?? "yt-dlp");
  const whisperCommand = deps.whisperCommand ?? configuredWhisperCommand ?? DEFAULT_WHISPER_COMMAND;
  const whisperModel = deps.whisperModel ?? configuredValue("TUBEMASTER_WHISPER_MODEL") ?? DEFAULT_WHISPER_MODEL;
  const whisperRun = deps.whisperRun ?? defaultRunner(whisperCommand);
  const readWhisperOutput = deps.readWhisperOutput ?? ((path: string) => readFile(path, "utf8"));
  const createTempDirectory = deps.createTempDirectory ?? (() => mkdtemp(join(tmpdir(), "tubemaster-transcript-")));
  const removeTempDirectory = deps.removeTempDirectory ?? ((path) => rm(path, { recursive: true, force: true }));

  async function transcribeLocally(videoId: string): Promise<TranscriptResult> {
    let directory: string | undefined;
    try {
      if (unsupportedBackend) return failure("local-transcription", "configuration-error");
      directory = await createTempDirectory();
      const audioPath = join(directory, "audio.wav");
      let download: YtDlpRunResult;
      try {
        download = await run([
          "--no-playlist", "--no-warnings", "--format", "bestaudio/best", "--extract-audio", "--audio-format", "wav",
          "--output", join(directory, "audio.%(ext)s"), videoUrl(videoId),
        ], timeoutMs);
      } catch (error) {
        const timedOut = error instanceof Error && (error as Error & { code?: string }).code === "ETIMEDOUT";
        return failure("local-audio", timedOut ? "timeout" : "process-error", true);
      }
      if (download.exitCode !== 0) return failure("local-audio", "non-zero-exit", true);

      let output: string;
      let whisperSegments: TranscriptSegment[] | undefined;
      if (deps.transcribe) {
        output = await deps.transcribe(audioPath, timeoutMs);
      } else {
        const outputPath = join(directory, "transcript.json");
        const transcription = await whisperRun([
          audioPath,
          "--model",
          whisperModel,
          "--output-dir",
          directory,
          "--output-name",
          "transcript",
          "--output-format",
          "json",
        ], timeoutMs);
            if (transcription.exitCode !== 0) return failure("local-transcription", "non-zero-exit", true);
            let outputContent: string;
            try {
              outputContent = await readWhisperOutput(outputPath);
            } catch {
              return failure("local-transcription", "process-error", true);
            }
            try {
              const parsed = parseWhisperOutput(outputContent);
              output = parsed.text;
              whisperSegments = parsed.segments;
            } catch {
              return failure("local-transcription", "malformed-output");
            }
      }
          const text = normalizeTranscript(output);
          if (!text) return failure("local-transcription", "malformed-output");
          return { status: "available", text, source: "local-whisper", ...(whisperSegments?.length ? { segments: whisperSegments } : {}) };
    } catch (error) {
      const timedOut = error instanceof Error && (error as Error & { code?: string }).code === "ETIMEDOUT";
      return failure(directory ? "local-transcription" : "local-audio", timedOut ? "timeout" : "process-error", true);
    } finally {
      if (directory) await removeTempDirectory(directory).catch(() => undefined);
    }
  }

  return {
    async getTranscript(args: { videoId: string }): Promise<TranscriptResult> {
      if (languages.length === 0) return noCaptions();
      let sawMalformed = false;
      let sawNonZero = false;
      let sawCaptionAbsence = false;
      for (const language of languages) {
        for (const automatic of [false, true]) {
          const commandArgs = ["--skip-download", "--no-warnings", automatic ? "--write-auto-subs" : "--write-subs", "--sub-langs", language, "--sub-format", "vtt/srt", "--output", "-", videoUrl(args.videoId)];
          let result: YtDlpRunResult;
          try { result = await run(commandArgs, timeoutMs); }
          catch (error) {
            if (error instanceof Error && (error as Error & { code?: string }).code === "ETIMEDOUT") return failure("public-video", "timeout", true);
            return failure("public-video", "process-error", true);
          }
          if (result.exitCode !== 0) {
            sawNonZero = true;
            if (/no subtitles|subtitles? (are )?not available|requested format is not available/i.test(result.stderr)) sawCaptionAbsence = true;
            continue;
          }
          const hasCaptionFormat = /WEBVTT|\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{1,2}:\d{2}:\d{2}[,.]\d{3}/i.test(result.stdout);
          const text = hasCaptionFormat ? normalizeTranscript(result.stdout) : "";
          if (text) return { status: "available", text, language };
          sawMalformed = true;
        }
      }
      if (sawMalformed) return transcribeLocally(args.videoId);
      if (sawNonZero && !sawCaptionAbsence) return failure("public-video", "non-zero-exit");
      return sawCaptionAbsence ? transcribeLocally(args.videoId) : noCaptions();
    },
  };
}
