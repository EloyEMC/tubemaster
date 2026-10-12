"use client";

import { useState } from "react";

type Provider = "youtube-captions" | "yt-dlp";
type Transcript =
  | { status: "available"; text: string; language?: string }
  | { status: "unavailable"; reason: string }
  | { status: "unsupported"; reason: string };

export function normalizeVideoId(input: string): string | null {
  const value = input.trim();
  const validId = /^[a-zA-Z0-9_-]{11}$/;
  if (validId.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    let id: string | undefined;
    if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
      id = url.pathname === "/watch" ? url.searchParams.get("v") ?? undefined
        : /^\/(shorts|embed|live)\/[^/]+\/?$/.test(url.pathname) ? url.pathname.split("/")[2] : undefined;
    } else if (host === "youtu.be" || host === "www.youtu.be") {
      id = /^\/[^/]+\/?$/.test(url.pathname) ? url.pathname.split("/")[1] : undefined;
    }
    return id && validId.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function transcriptDisplayText(transcript: Transcript | null, error: string | null, loading: boolean): string | null {
  if (loading) return "Loading transcript...";
  if (error) return error;
  if (transcript?.status === "available") return `Available${transcript.language ? ` · ${transcript.language}` : ""}`;
  if (transcript?.status === "unavailable") return transcript.reason === "no-captions"
    ? "No captions are available for this video."
    : "The transcript is currently unavailable.";
  if (transcript?.status === "unsupported") return "This transcript provider is unsupported.";
  return null;
}

export async function requestTranscript(videoId: string, provider: Provider, fetcher: typeof fetch = fetch): Promise<Transcript> {
  const response = await fetcher("/api/video-metadata/transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId, provider }),
  });
  if (response.status === 401) throw new Error("Sign in to use the transcript dashboard.");
  if (!response.ok) throw new Error("Unable to load transcript. Please try again.");
  const data: { transcript: Transcript } = await response.json();
  return data.transcript;
}

export function TranscriptDashboard() {
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<Provider>("youtube-captions");
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const videoId = normalizeVideoId(input);
    setTranscript(null);
    if (!videoId) {
      setError("Enter a valid YouTube URL or 11-character video ID.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setTranscript(await requestTranscript(videoId, provider));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load transcript. Please try again.");
    } finally {
      setLoading(false);
    }
  }

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
            <option value="yt-dlp">yt-dlp (public video)</option>
          </select>
        </div>
        <button type="submit" disabled={loading || !input.trim()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
          {loading ? "Loading transcript..." : "Load transcript"}
        </button>
      </form>
      <div aria-live="polite" aria-busy={loading}>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-400">{error}</p>}
        {transcript?.status === "available" && <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3"><p className="mb-2 text-xs text-zinc-500">{transcriptDisplayText(transcript, null, false)}</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-sm text-zinc-200">{transcript.text}</pre></div>}
        {transcript?.status === "unavailable" && <p role="status" className="mt-4 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-400">{transcriptDisplayText(transcript, null, false)}</p>}
        {transcript?.status === "unsupported" && <p role="alert" className="mt-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-400">{transcriptDisplayText(transcript, null, false)}</p>}
      </div>
    </section>
  );
}
