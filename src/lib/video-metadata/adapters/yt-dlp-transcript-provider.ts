import { spawn } from "node:child_process";
import type { TranscriptResult } from "../contracts";

type RunResult = { exitCode: number | null; stdout: string; stderr: string };
type Runner = (args: string[], timeoutMs: number) => Promise<RunResult>;
type Dependencies = { command?: string; languages?: string[]; timeoutMs?: number; run?: Runner };

function runCommand(command: string): Runner {
  return (args, timeoutMs) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));
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

function normalizeCaptions(payload: string) {
  const lines: string[] = [];
  for (const block of payload.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const parts = block.split("\n").map((line) => line.trim());
    const timestamp = parts.findIndex((line) => /^\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s+-->/.test(line));
    if (timestamp < 0) continue;
    for (const line of parts.slice(timestamp + 1)) {
      const cleaned = line.replace(/<\d{1,2}:\d{2}:\d{2}[,.]\d{3}>/g, "")
        .replace(/<\/?(?:b|i|u|c(?:\.[^ >]+)?|v(?:\s+[^>]*)?|lang(?:\s+[^>]*)?)>/gi, "")
        .replace(/\s+/g, " ").trim();
      if (cleaned && lines[lines.length - 1] !== cleaned) lines.push(cleaned);
    }
  }
  return lines.join("\n");
}

function failure(errorCode: "timeout" | "process-error" | "non-zero-exit" | "malformed-output", retriable = false): TranscriptResult {
  return { status: "unavailable", reason: "unknown", diagnostic: { stage: "public-video", errorCode, retriable } };
}

export function createYtDlpTranscriptProvider(deps: Dependencies = {}) {
  const run = deps.run ?? runCommand(deps.command ?? "yt-dlp");
  const languages = [...new Set((deps.languages ?? ["en"]).map((value) => value.trim()).filter(Boolean))];
  return {
    async getTranscript({ videoId }: { videoId: string }): Promise<TranscriptResult> {
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || languages.length === 0) {
        return { status: "unavailable", reason: "no-captions" };
      }
      let absent = false;
      let malformed = false;
      for (const language of languages) {
        for (const automatic of [false, true]) {
          let result: RunResult;
          try {
            result = await run([
              "--skip-download", "--no-warnings", automatic ? "--write-auto-subs" : "--write-subs",
              "--sub-langs", language, "--sub-format", "vtt/srt", "--output", "-",
              `https://www.youtube.com/watch?v=${videoId}`,
            ], deps.timeoutMs ?? 15_000);
          } catch (error) {
            return failure(error instanceof Error && (error as Error & { code?: string }).code === "ETIMEDOUT" ? "timeout" : "process-error", true);
          }
          if (result.exitCode !== 0) {
            absent ||= /no subtitles|subtitles? (are )?not available|requested format is not available/i.test(result.stderr);
            continue;
          }
          const text = normalizeCaptions(result.stdout);
          if (text) return { status: "available", text, language };
          malformed = true;
        }
      }
      if (absent) return { status: "unavailable", reason: "no-captions" };
      return failure(malformed ? "malformed-output" : "non-zero-exit");
    },
  };
}
