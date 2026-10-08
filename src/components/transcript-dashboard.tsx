"use client";

import { useState } from "react";
import { parseVideoId } from "@/lib/video-metadata/parse-video-id";
import type { TranscriptResult, TranscriptSegment } from "@/lib/video-metadata/contracts";

type Provider = "youtube-captions" | "yt-dlp";
type Transcript =
  | { status: "available"; text: string; language?: string; source?: "captions" | "local-whisper"; segments?: TranscriptSegment[] }
  | { status: "unavailable"; reason: string; diagnostic?: { stage: string; errorCode?: string; apiReason?: string } }
  | { status: "unsupported"; reason: string };

const safeStages = new Set(["captions-list", "captions-download", "public-video", "local-transcription"]);
const safeErrorCodes = new Set(["timeout", "process-error", "non-zero-exit", "malformed-output", "configuration-error"]);

export function transcriptDisplayText(transcript: Transcript | null, error: string | null, loading: boolean) {
  if (loading) return "Loading transcript...";
  if (error) return error;
  if (transcript?.status === "available") return `Available${transcript.language ? ` · ${transcript.language}` : ""}`;
  if (transcript?.status === "unavailable") {
    const diagnostic = transcript.diagnostic;
    if (diagnostic?.stage === "local-transcription" && diagnostic.errorCode === "configuration-error") {
      return "yt-dlp/ffmpeg may be available, but a local Whisper backend (mlx-whisper or faster-whisper) is not configured. Configure one to transcribe this video.";
    }
    if (transcript.reason === "no-captions") {
      return "No captions are available for this video. Try YouTube captions or configure local Whisper (mlx-whisper or faster-whisper).";
    }
    const summary = diagnostic && safeStages.has(diagnostic.stage) && diagnostic.errorCode && safeErrorCodes.has(diagnostic.errorCode)
      ? ` (${diagnostic.stage}: ${diagnostic.errorCode})`
      : "";
    return `The transcript is currently unavailable${summary}. Try again or use another transcript provider.`;
  }
  if (transcript?.status === "unsupported") return "This transcript provider is unsupported.";
  return null;
}

export function transcriptDisplayText(transcript: Transcript | null, error: string | null, loading: boolean) {
  if (loading) return "Loading transcript...";
  if (error) return error;
  if (transcript?.status === "available") return `Available${transcript.language ? ` · ${transcript.language}` : ""}`;
  if (transcript?.status === "unavailable") {
    return transcript.reason === "no-captions"
      ? "No captions are available for this video."
      : "The transcript is currently unavailable.";
  }
  if (transcript?.status === "unsupported") return "This transcript provider is unsupported.";
  return null;
}

function formatTimestamp(seconds: number) {
  const totalSeconds = Math.floor(Math.max(0, seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  return hours > 0
    ? [hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":")
    : [minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":");
}

export function formatTranscriptResult(transcript: Extract<TranscriptResult, { status: "available" }>) {
  const segments = transcript.source === "local-whisper"
    ? transcript.segments?.filter((segment: TranscriptSegment) => Number.isFinite(segment.start) && segment.start >= 0 && typeof segment.text === "string" && segment.text.trim())
    : undefined;
  if (!segments?.length) return transcript.text;
  return [...segments]
    .sort((left, right) => left.start - right.start)
    .map((segment) => `[${formatTimestamp(segment.start)}] ${segment.text.trim()}`)
    .join("\n");
}

export function TranscriptDashboard() {
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<Provider>("youtube-captions");
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const videoId = parseVideoId(input);
    if (!videoId) {
      setError("Enter a valid YouTube URL or 11-character video ID.");
      setTranscript(null);
      return;
    }

    setLoading(true);
    setError(null);
    setTranscript(null);
    try {
      const response = await fetch("/api/video-metadata/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, provider }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(response.status === 401 ? "Sign in to use the transcript dashboard." : data.message ?? "Unable to load transcript.");
        return;
      }
      setTranscript(data.transcript);
    } catch {
      setError("Unable to load transcript. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const displayText = transcriptDisplayText(transcript, error, loading);

  return (
    <section className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900 p-4" aria-labelledby="transcript-heading">
      <h2 id="transcript-heading" className="mb-1 text-lg font-semibold">Transcript dashboard</h2>
      <p className="mb-4 text-sm text-zinc-400">Load a transcript using the provider that fits your video.</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="transcript-video" className="mb-1 block text-xs font-medium text-zinc-400">YouTube URL or video ID</label>
          <input id="transcript-video" value={input} onChange={(event) => setInput(event.target.value)} disabled={loading} placeholder="https://youtube.com/watch?v=..." className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm placeholder:text-zinc-600 disabled:opacity-50" />
        </div>
        <div>
          <label htmlFor="transcript-provider" className="mb-1 block text-xs font-medium text-zinc-400">Transcript provider</label>
          <select id="transcript-provider" value={provider} onChange={(event) => setProvider(event.target.value as Provider)} disabled={loading} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm disabled:opacity-50">
            <option value="youtube-captions">YouTube captions (OAuth)</option>
            <option value="yt-dlp">yt-dlp (captions, then local audio)</option>
          </select>
        </div>
        <button type="submit" disabled={loading || !input.trim()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
          {loading ? "Loading transcript..." : "Load transcript"}
        </button>
      </form>
      {error && <p role="alert" aria-live="assertive" className="mt-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-400">{error}</p>}
      {transcript?.status === "available" && <div aria-live="polite" className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3"><p className="mb-2 text-xs text-zinc-500">{transcript.source === "local-whisper" ? "Local Whisper transcription" : "Captions"}{transcript.language ? ` · ${transcript.language}` : ""}</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-sm text-zinc-200">{formatTranscriptResult(transcript as Extract<TranscriptResult, { status: "available" }>)}</pre></div>}
      {transcript?.status === "unavailable" && <p role="status" aria-live="polite" className="mt-4 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-400">{displayText}</p>}
      {transcript?.status === "unsupported" && <p role="alert" aria-live="assertive" className="mt-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-400">{displayText}</p>}
    </section>
  );
}
