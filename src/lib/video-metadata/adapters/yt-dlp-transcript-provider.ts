import { spawn } from "node:child_process";
import type { TranscriptResult } from "../contracts";
import { normalizeTranscript } from "../transcript-normalizer";

export type YtDlpRunResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

type YtDlpRunner = (args: string[], timeoutMs: number) => Promise<YtDlpRunResult>;

type YtDlpProviderDeps = {
  command?: string;
  languages?: string[];
  timeoutMs?: number;
  run?: YtDlpRunner;
};

const DEFAULT_LANGUAGES = ["en"];
const DEFAULT_TIMEOUT_MS = 15_000;

function videoUrl(videoId: string) {
  return /^https?:\/\//i.test(videoId)
    ? videoId
    : `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function publicVideoFailure(errorCode: "timeout" | "process-error" | "non-zero-exit" | "malformed-output", retriable = false): TranscriptResult {
  return {
    status: "unavailable",
    reason: "unknown",
    diagnostic: { stage: "public-video", errorCode, retriable },
  };
}

function noCaptions(): TranscriptResult {
  return { status: "unavailable", reason: "no-captions" };
}

function defaultRunner(command: string): YtDlpRunner {
  return (args, timeoutMs) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        reject(Object.assign(new Error("yt-dlp timed out"), { code: "ETIMEDOUT" }));
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

export function createYtDlpTranscriptProvider(deps: YtDlpProviderDeps = {}) {
  const languages = [...new Set((deps.languages ?? DEFAULT_LANGUAGES).map((language) => language.trim()).filter(Boolean))];
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const run = deps.run ?? defaultRunner(deps.command ?? "yt-dlp");

  return {
    async getTranscript(args: { videoId: string }): Promise<TranscriptResult> {
      if (languages.length === 0) return noCaptions();
      let sawMalformed = false;
      let sawNonZero = false;
      let sawCaptionAbsence = false;

      for (const language of languages) {
        for (const automatic of [false, true]) {
          const commandArgs = [
            "--skip-download",
            "--no-warnings",
            automatic ? "--write-auto-subs" : "--write-subs",
            "--sub-langs",
            language,
            "--sub-format",
            "vtt/srt",
            "--output",
            "-",
            videoUrl(args.videoId),
          ];

          let result: YtDlpRunResult;
          try {
            result = await run(commandArgs, timeoutMs);
          } catch (error) {
            if (error instanceof Error && (error as Error & { code?: string }).code === "ETIMEDOUT") {
              return publicVideoFailure("timeout", true);
            }
            return publicVideoFailure("process-error", true);
          }

          if (result.exitCode !== 0) {
            sawNonZero = true;
            if (/no subtitles|subtitles? (are )?not available|requested format is not available/i.test(result.stderr)) {
              sawCaptionAbsence = true;
            }
            continue;
          }

          const hasCaptionFormat = /WEBVTT|\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{1,2}:\d{2}:\d{2}[,.]\d{3}/i.test(result.stdout);
          const text = hasCaptionFormat ? normalizeTranscript(result.stdout) : "";
          if (text) return { status: "available", text, language };
          sawMalformed = true;
        }
      }

      if (sawMalformed && !sawNonZero) return publicVideoFailure("malformed-output");
      if (sawNonZero && !sawMalformed && !sawCaptionAbsence) return publicVideoFailure("non-zero-exit");
      return noCaptions();
    },
  };
}
